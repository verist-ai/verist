// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_PATH = join(import.meta.dir, "../src/cli.ts");
const ROOT_DIR = join(import.meta.dir, "../../..");

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `verist-fmt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  symlinkSync(join(ROOT_DIR, "node_modules"), join(dir, "node_modules"));
  return dir;
}

async function runCli(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "run", CLI_PATH, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

function writeConfig(dir: string, runFn: string = "input.value * 2"): void {
  writeFileSync(
    join(dir, "verist.config.ts"),
    `import { defineStep } from "@verist/core";
import { z } from "zod";

const doubleStep = defineStep({
  name: "double",
  input: z.object({ value: z.number() }),
  delta: z.object({ result: z.number() }),
  run: async (input) => ({
    delta: { result: ${runFn} },
    events: [{ type: "computed" }],
  }),
});

export default {
  steps: { double: doubleStep },
  adapters: {},
};
`,
  );
}

describe("--format option", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeConfig(tmpDir);
    writeFileSync(join(tmpDir, "input-a.json"), '{ "value": 10 }');
    writeFileSync(join(tmpDir, "input-b.json"), '{ "value": 20 }');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("--format json produces valid JSON with version/status/counts", async () => {
    await runCli(
      ["capture", "--step", "double", "--input", "input-*.json"],
      tmpDir,
    );

    const { stdout, exitCode } = await runCli(
      ["test", "--step", "double", "--format", "json"],
      tmpDir,
    );
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout);
    expect(parsed.version).toBe(1);
    expect(parsed.step).toBe("double");
    expect(parsed.status).toBe("pass");
    expect(parsed.counts.total).toBe(2);
    expect(parsed.counts.passed).toBe(2);
    expect(parsed.baselines).toHaveLength(2);
  });

  it("--format markdown produces markdown table", async () => {
    await runCli(
      ["capture", "--step", "double", "--input", "input-*.json"],
      tmpDir,
    );

    const { stdout, exitCode } = await runCli(
      ["diff", "--step", "double", "--format", "markdown"],
      tmpDir,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("### Verist");
    expect(stdout).toContain("| Metric | Count |");
    expect(stdout).toContain("| Total | 2 |");
  });

  it("regressions reflected in JSON status and baselines", async () => {
    await runCli(
      ["capture", "--step", "double", "--input", "input-*.json"],
      tmpDir,
    );

    // Change step to triple → causes diffs
    writeConfig(tmpDir, "input.value * 3");

    const { stdout, exitCode } = await runCli(
      ["test", "--step", "double", "--format", "json"],
      tmpDir,
    );
    expect(exitCode).toBe(1);

    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("fail");
    expect(parsed.counts.changed).toBe(2);

    // All baselines should show value_changed
    for (const b of parsed.baselines) {
      expect(b.status).toBe("value_changed");
    }
  });

  it("--format json works with diff command (exit 0 even with changes)", async () => {
    await runCli(
      ["capture", "--step", "double", "--input", "input-a.json"],
      tmpDir,
    );
    writeConfig(tmpDir, "input.value * 3");

    const { stdout, exitCode } = await runCli(
      ["diff", "--step", "double", "--format", "json"],
      tmpDir,
    );
    expect(exitCode).toBe(0); // diff is exploratory

    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("fail");
    expect(parsed.counts.changed).toBe(1);
  });
});
