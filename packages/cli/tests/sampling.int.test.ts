// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_PATH = join(import.meta.dir, "../src/cli.ts");
const ROOT_DIR = join(import.meta.dir, "../../..");

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `verist-sample-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

function writeConfig(dir: string): void {
  writeFileSync(
    join(dir, "verist.config.ts"),
    `import { defineStep } from "verist";
import { z } from "zod";

const doubleStep = defineStep({
  name: "double",
  input: z.object({ value: z.number() }),
  delta: z.object({ result: z.number() }),
  run: async (input) => ({
    delta: { result: input.value * 2 },
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

describe("--sample and --seed", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeConfig(tmpDir);
    for (let i = 1; i <= 5; i++) {
      writeFileSync(
        join(tmpDir, `input-${i}.json`),
        JSON.stringify({ value: i }),
      );
    }
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("--sample 2 --seed 42 captures exactly 2 baselines", async () => {
    const { exitCode, stdout } = await runCli(
      [
        "capture",
        "--step",
        "double",
        "--input",
        "input-*.json",
        "--sample",
        "2",
        "--seed",
        "42",
      ],
      tmpDir,
    );
    expect(exitCode).toBe(0);

    // Count captured lines
    const capturedLines = stdout.split("\n").filter((l) => l.includes("→"));
    expect(capturedLines).toHaveLength(2);

    // Baseline directory should have exactly 2 files
    const baseDir = join(
      tmpDir,
      ".verist",
      "baselines",
      "double",
      "0.0.0",
      "double",
    );
    const files = readdirSync(baseDir).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(2);
  });

  it("same seed produces same selection", async () => {
    const run1 = await runCli(
      [
        "capture",
        "--step",
        "double",
        "--input",
        "input-*.json",
        "--sample",
        "2",
        "--seed",
        "42",
      ],
      tmpDir,
    );

    // Clear baselines
    rmSync(join(tmpDir, ".verist"), { recursive: true, force: true });

    const run2 = await runCli(
      [
        "capture",
        "--step",
        "double",
        "--input",
        "input-*.json",
        "--sample",
        "2",
        "--seed",
        "42",
      ],
      tmpDir,
    );

    // Both should capture the same files
    const files1 = run1.stdout
      .split("\n")
      .filter((l) => l.includes("→"))
      .sort();
    const files2 = run2.stdout
      .split("\n")
      .filter((l) => l.includes("→"))
      .sort();
    expect(files1).toEqual(files2);
  });
});

describe("--meta", () => {
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

  it("--meta stored in baseline envelope", async () => {
    const { exitCode } = await runCli(
      [
        "capture",
        "--step",
        "double",
        "--input",
        "input-a.json",
        "--meta",
        "model=gpt-4o",
        "--meta",
        "env=prod",
      ],
      tmpDir,
    );
    expect(exitCode).toBe(0);

    // Read the baseline file and check meta
    const baseDir = join(
      tmpDir,
      ".verist",
      "baselines",
      "double",
      "0.0.0",
      "double",
    );
    const files = readdirSync(baseDir).filter((f) => f.endsWith(".json"));
    const { readFileSync } = await import("node:fs");
    const envelope = JSON.parse(
      readFileSync(join(baseDir, files[0]!), "utf-8"),
    );
    expect(envelope.metadata.meta).toEqual({ model: "gpt-4o", env: "prod" });
  });

  it("--meta filtering in replay", async () => {
    // Capture with meta
    await runCli(
      [
        "capture",
        "--step",
        "double",
        "--input",
        "input-a.json",
        "--meta",
        "model=gpt-4o",
      ],
      tmpDir,
    );
    // Capture without meta
    await runCli(
      ["capture", "--step", "double", "--input", "input-b.json"],
      tmpDir,
    );

    // Replay with meta filter should only show the first baseline
    const { stdout, exitCode } = await runCli(
      ["replay", "--step", "double", "--meta", "model=gpt-4o"],
      tmpDir,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("1 baseline(s)");
  }, 15_000);

  it("--meta filtering in test", async () => {
    // Capture both with different meta
    await runCli(
      [
        "capture",
        "--step",
        "double",
        "--input",
        "input-a.json",
        "--meta",
        "model=gpt-4o",
      ],
      tmpDir,
    );
    await runCli(
      [
        "capture",
        "--step",
        "double",
        "--input",
        "input-b.json",
        "--meta",
        "model=gpt-3.5",
      ],
      tmpDir,
    );

    // Test with meta filter — only one baseline
    const { stdout, exitCode } = await runCli(
      [
        "test",
        "--step",
        "double",
        "--meta",
        "model=gpt-4o",
        "--format",
        "json",
      ],
      tmpDir,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.counts.total).toBe(1);
  }, 15_000);
});

describe("--label", () => {
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

  // Each test spawns 3 CLI subprocesses (2 captures + 1 command)
  it("--label filters baselines in test command", async () => {
    await runCli(
      [
        "capture",
        "--step",
        "double",
        "--input",
        "input-a.json",
        "--label",
        "v1",
      ],
      tmpDir,
    );
    await runCli(
      [
        "capture",
        "--step",
        "double",
        "--input",
        "input-b.json",
        "--label",
        "v2",
      ],
      tmpDir,
    );

    const { stdout, exitCode } = await runCli(
      ["test", "--step", "double", "--label", "v1", "--format", "json"],
      tmpDir,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.counts.total).toBe(1);
  }, 15_000);

  it("--label filters baselines in diff command", async () => {
    await runCli(
      [
        "capture",
        "--step",
        "double",
        "--input",
        "input-a.json",
        "--label",
        "v1",
      ],
      tmpDir,
    );
    await runCli(
      [
        "capture",
        "--step",
        "double",
        "--input",
        "input-b.json",
        "--label",
        "v2",
      ],
      tmpDir,
    );

    const { stdout, exitCode } = await runCli(
      ["diff", "--step", "double", "--label", "v1", "--format", "json"],
      tmpDir,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.counts.total).toBe(1);
  }, 15_000);
});
