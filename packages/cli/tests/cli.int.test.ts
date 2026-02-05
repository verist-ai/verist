// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
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
    `verist-int-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  // Symlink node_modules so Bun can resolve workspace packages
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
    `import { defineStep } from "verist";
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

describe("verist CLI integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeConfig(tmpDir);
    writeFileSync(join(tmpDir, "input-valid.json"), '{ "value": 21 }');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("capture: invalid JSON → clean error, exit 2", async () => {
    writeFileSync(join(tmpDir, "input-invalid.json"), "not valid json");
    const { stderr, exitCode } = await runCli(
      ["capture", "--step", "double", "--input", "input-invalid.json"],
      tmpDir,
    );
    expect(stderr).toContain("Invalid JSON");
    expect(exitCode).toBe(2);
  });

  it("capture: valid input → creates baseline", async () => {
    const { stdout, exitCode } = await runCli(
      ["capture", "--step", "double", "--input", "input-valid.json"],
      tmpDir,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("input-valid");

    const baselinesDir = join(tmpDir, ".verist", "baselines");
    expect(existsSync(baselinesDir)).toBe(true);
  });

  it("capture + diff: exits 0 with unchanged output", async () => {
    const captureResult = await runCli(
      ["capture", "--step", "double", "--input", "input-valid.json"],
      tmpDir,
    );
    expect(captureResult.exitCode).toBe(0);

    const { stdout, exitCode } = await runCli(
      ["diff", "--step", "double"],
      tmpDir,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("clean");
  });

  it("capture + test: exits 0 when no diffs (deterministic step)", async () => {
    const captureResult = await runCli(
      ["capture", "--step", "double", "--input", "input-valid.json"],
      tmpDir,
    );
    expect(captureResult.exitCode).toBe(0);

    const { exitCode } = await runCli(["test", "--step", "double"], tmpDir);
    expect(exitCode).toBe(0);
  });

  it("capture + test: exits 1 when delta changed", async () => {
    const captureResult = await runCli(
      ["capture", "--step", "double", "--input", "input-valid.json"],
      tmpDir,
    );
    expect(captureResult.exitCode).toBe(0);

    // Rewrite config to triple instead of double
    writeConfig(tmpDir, "input.value * 3");

    const { exitCode, stdout } = await runCli(
      ["test", "--step", "double"],
      tmpDir,
    );
    expect(exitCode).toBe(1);
    expect(stdout).toContain("changed");
  });

  it("--baseline + --workflow → error, exit 2", async () => {
    const { stderr, exitCode } = await runCli(
      ["diff", "--baseline", ".verist/baselines", "--workflow", "my-wf"],
      tmpDir,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Cannot use --baseline with");
  });

  it("--baseline + --step → error, exit 2", async () => {
    const { stderr, exitCode } = await runCli(
      ["diff", "--baseline", ".verist/baselines", "--step", "double"],
      tmpDir,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Cannot use --baseline with");
  });

  it("schema mismatch → actionable error suggesting recapture", async () => {
    const captureResult = await runCli(
      ["capture", "--step", "double", "--input", "input-valid.json"],
      tmpDir,
    );
    expect(captureResult.exitCode).toBe(0);

    // Change input schema to expect string
    writeFileSync(
      join(tmpDir, "verist.config.ts"),
      `import { defineStep } from "verist";
import { z } from "zod";

const doubleStep = defineStep({
  name: "double",
  input: z.object({ value: z.string() }),
  delta: z.object({ result: z.string() }),
  run: async (input) => ({
    delta: { result: input.value + input.value },
    events: [],
  }),
});

export default {
  steps: { double: doubleStep },
  adapters: {},
};
`,
    );

    const { stderr, exitCode } = await runCli(
      ["test", "--step", "double"],
      tmpDir,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("verist capture");
  });

  it("corrupted baseline → controlled error, no stack trace", async () => {
    // Capture a valid baseline first to create the directory
    const captureResult = await runCli(
      ["capture", "--step", "double", "--input", "input-valid.json"],
      tmpDir,
    );
    expect(captureResult.exitCode).toBe(0);

    // Corrupt the baseline file
    const baselinesDir = join(
      tmpDir,
      ".verist",
      "baselines",
      "double",
      "0.0.0",
      "double",
    );
    const files = readdirSync(baselinesDir);
    writeFileSync(join(baselinesDir, files[0]!), "not valid json");

    const { stderr, exitCode } = await runCli(
      ["test", "--step", "double"],
      tmpDir,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Invalid JSON");
    // Should NOT contain a stack trace
    expect(stderr).not.toContain("at ");
  });

  it("deterministic input processing order", async () => {
    writeFileSync(join(tmpDir, "z-input.json"), '{ "value": 3 }');
    writeFileSync(join(tmpDir, "a-input.json"), '{ "value": 1 }');
    writeFileSync(join(tmpDir, "m-input.json"), '{ "value": 2 }');

    const { stdout, exitCode } = await runCli(
      ["capture", "--step", "double", "--input", "?-input.json"],
      tmpDir,
    );
    expect(exitCode).toBe(0);

    const lines = stdout.split("\n").filter((l) => l.includes("→"));
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain("a-input");
    expect(lines[1]).toContain("m-input");
    expect(lines[2]).toContain("z-input");
  });
});
