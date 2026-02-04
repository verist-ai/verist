// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "bun:test";
import type { DiffCounts } from "../commands/run-diff.ts";
import type { BaselineEntry, MachineOutput } from "./machine.ts";
import { formatJson, formatMarkdown } from "./machine.ts";

function makeCounts(overrides: Partial<DiffCounts> = {}): DiffCounts {
  return {
    total: 3,
    passed: 3,
    changed: 0,
    schemaViolations: 0,
    failed: 0,
    commandsChanged: 0,
    diffUnavailable: 0,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<BaselineEntry> = {}): BaselineEntry {
  return {
    filename: "test-abc12345.json",
    status: "clean",
    comparable: true,
    schemaViolations: [],
    deltaDiff: null,
    commandsDiff: null,
    ...overrides,
  };
}

describe("formatJson", () => {
  it("produces valid JSON with version and status", () => {
    const counts = makeCounts();
    const baselines = [makeEntry()];
    const raw = formatJson("test", counts, baselines);
    const parsed: MachineOutput = JSON.parse(raw);

    expect(parsed.version).toBe(1);
    expect(parsed.step).toBe("test");
    expect(parsed.status).toBe("pass");
    expect(parsed.summary).toContain("3 baseline(s)");
    expect(parsed.counts.total).toBe(3);
    expect(parsed.baselines).toHaveLength(1);
  });

  it("status is fail when changes detected", () => {
    const counts = makeCounts({ passed: 1, changed: 2 });
    const raw = formatJson("diff", counts, []);
    const parsed: MachineOutput = JSON.parse(raw);

    expect(parsed.status).toBe("fail");
  });

  it("status is fail on schema violations", () => {
    const counts = makeCounts({ passed: 2, schemaViolations: 1 });
    const raw = formatJson("test", counts, []);
    const parsed: MachineOutput = JSON.parse(raw);

    expect(parsed.status).toBe("fail");
  });

  it("status is error on infrastructure failures", () => {
    const counts = makeCounts({ passed: 2, failed: 1 });
    const raw = formatJson("test", counts, []);
    const parsed: MachineOutput = JSON.parse(raw);

    expect(parsed.status).toBe("error");
  });

  it("status is error even when changes also present", () => {
    const counts = makeCounts({ passed: 0, changed: 1, failed: 1 });
    const raw = formatJson("test", counts, []);
    const parsed: MachineOutput = JSON.parse(raw);

    // Infrastructure failures take precedence over regressions
    expect(parsed.status).toBe("error");
  });

  it("includes baseline entries with full detail", () => {
    const baselines = [
      makeEntry({
        filename: "a.json",
        status: "value_changed",
        deltaDiff: {
          equal: false,
          entries: [{ path: ["x"], before: 1, after: 2 }],
        },
      }),
      makeEntry({ filename: "b.json", status: "clean" }),
    ];
    const raw = formatJson(
      "test",
      makeCounts({ passed: 1, changed: 1 }),
      baselines,
    );
    const parsed: MachineOutput = JSON.parse(raw);

    expect(parsed.baselines[0]!.status).toBe("value_changed");
    expect(parsed.baselines[0]!.deltaDiff!.entries).toHaveLength(1);
    expect(parsed.baselines[1]!.status).toBe("clean");
  });

  it("includes error message for failed baselines", () => {
    const baselines = [
      makeEntry({
        filename: "broken.json",
        status: "failed",
        error: "Invalid JSON in baseline file",
      }),
    ];
    const raw = formatJson(
      "test",
      makeCounts({ passed: 2, failed: 1 }),
      baselines,
    );
    const parsed: MachineOutput = JSON.parse(raw);

    expect(parsed.baselines[0]!.error).toBe("Invalid JSON in baseline file");
  });
});

describe("formatMarkdown", () => {
  it("produces markdown with table header", () => {
    const md = formatMarkdown("test", makeCounts(), [makeEntry()]);

    expect(md).toContain("### Verist `test`");
    expect(md).toContain("| Metric | Count |");
    expect(md).toContain("| Total | 3 |");
    expect(md).toContain("Pass");
  });

  it("shows Fail status when changes exist", () => {
    const md = formatMarkdown("test", makeCounts({ passed: 1, changed: 2 }), [
      makeEntry({ status: "value_changed" }),
    ]);

    expect(md).toContain("Fail");
    expect(md).toContain("| Changed | 2 |");
  });

  it("lists changed baselines", () => {
    const baselines = [
      makeEntry({ filename: "a.json", status: "value_changed" }),
      makeEntry({ filename: "b.json", status: "clean" }),
      makeEntry({ filename: "c.json", status: "schema_violation" }),
    ];
    const md = formatMarkdown(
      "test",
      makeCounts({ passed: 1, changed: 1, schemaViolations: 1 }),
      baselines,
    );

    expect(md).toContain("#### Changed baselines");
    expect(md).toContain("`a.json` — value_changed");
    expect(md).toContain("`c.json` — schema_violation");
    expect(md).not.toContain("`b.json`");
  });

  it("shows Error status on infrastructure failures", () => {
    const md = formatMarkdown("test", makeCounts({ passed: 2, failed: 1 }), [
      makeEntry({ status: "failed" }),
    ]);

    expect(md).toContain("Error");
    expect(md).toContain("| Failed | 1 |");
  });

  it("omits zero-count rows", () => {
    const md = formatMarkdown("diff", makeCounts(), []);

    expect(md).toContain("| Clean | 3 |");
    expect(md).not.toContain("Changed");
    expect(md).not.toContain("Failed");
  });
});
