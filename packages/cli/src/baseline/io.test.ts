// SPDX-License-Identifier: Apache-2.0

import type { Snapshot } from "@verist/replay";
import { afterEach, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listBaselines,
  readBaseline,
  writeBaseline,
  type BaselineEnvelope,
} from "./io.ts";

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `verist-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  return dir;
}

function makeSnapshot(overrides?: Partial<Snapshot>): Snapshot {
  return {
    workflowId: "wf",
    workflowVersion: "1.0.0",
    stepName: "extract",
    input: { id: 1 },
    inputHash: "sha256:abc",
    artifacts: [
      { hash: "sha256:def", kind: "step-output", content: { delta: {} } },
    ],
    capturedAt: 1700000000000,
    ...overrides,
  };
}

function makeEnvelope(overrides?: Partial<BaselineEnvelope>): BaselineEnvelope {
  return {
    format: "verist-baseline@1",
    snapshot: makeSnapshot(),
    metadata: { inputPath: "data/input.json", commandsCaptured: false },
    ...overrides,
  };
}

describe("writeBaseline / readBaseline round-trip", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it("writes and reads back identical envelope", () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    const envelope = makeEnvelope();

    const path = writeBaseline(dir, "test.json", envelope);
    const loaded = readBaseline(path);

    expect(loaded).toEqual(envelope);
  });

  it("throws if snapshot has zero step-output artifacts", () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    const envelope = makeEnvelope({
      snapshot: makeSnapshot({ artifacts: [] }),
    });

    expect(() => writeBaseline(dir, "test.json", envelope)).toThrow(
      "exactly one step-output artifact",
    );
  });

  it("throws if snapshot has multiple step-output artifacts", () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    const envelope = makeEnvelope({
      snapshot: makeSnapshot({
        artifacts: [
          { hash: "sha256:a", kind: "step-output", content: { delta: {} } },
          { hash: "sha256:b", kind: "step-output", content: { delta: {} } },
        ],
      }),
    });

    expect(() => writeBaseline(dir, "test.json", envelope)).toThrow(
      "exactly one step-output artifact",
    );
  });

  it("throws if snapshot has multiple step-commands artifacts", () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    const envelope = makeEnvelope({
      snapshot: makeSnapshot({
        artifacts: [
          { hash: "sha256:a", kind: "step-output", content: { delta: {} } },
          { hash: "sha256:b", kind: "step-commands", content: [] },
          { hash: "sha256:c", kind: "step-commands", content: [] },
        ],
      }),
    });

    expect(() => writeBaseline(dir, "test.json", envelope)).toThrow(
      "at most one step-commands artifact",
    );
  });
});

describe("readBaseline", () => {
  it("throws on missing file", () => {
    expect(() => readBaseline("/tmp/nonexistent.json")).toThrow(
      "Baseline file not found",
    );
  });

  it("throws on unsupported format version", () => {
    const dir = makeTmpDir();
    const path = join(dir, "bad.json");
    const { mkdirSync, writeFileSync } = require("fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify({ format: "verist-baseline@99" }));

    try {
      expect(() => readBaseline(path)).toThrow("Unsupported baseline format");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws on invalid artifact invariants in file", () => {
    const dir = makeTmpDir();
    const path = join(dir, "bad-artifacts.json");
    const { mkdirSync, writeFileSync } = require("fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({
        format: "verist-baseline@1",
        snapshot: {
          workflowId: "wf",
          workflowVersion: "1.0.0",
          stepName: "s",
          input: {},
          inputHash: "sha256:x",
          artifacts: [],
          capturedAt: 0,
        },
        metadata: { inputPath: "x.json", commandsCaptured: false },
      }),
    );

    try {
      expect(() => readBaseline(path)).toThrow(
        "exactly one step-output artifact",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("listBaselines", () => {
  it("returns empty array for nonexistent directory", () => {
    expect(listBaselines("/tmp/nonexistent-baselines")).toEqual([]);
  });

  it("lists and sorts JSON files", () => {
    const dir = makeTmpDir();
    const { mkdirSync, writeFileSync } = require("fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "b.json"), "{}");
    writeFileSync(join(dir, "a.json"), "{}");
    writeFileSync(join(dir, "c.txt"), "not json");

    try {
      const files = listBaselines(dir);
      expect(files).toEqual([join(dir, "a.json"), join(dir, "b.json")]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
