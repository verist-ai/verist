// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_PATH = join(import.meta.dir, "../src/cli.ts");
const ROOT_DIR = join(import.meta.dir, "../../..");

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `verist-init-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

describe("verist init", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("scaffolds config and sample input", async () => {
    const { stdout, exitCode } = await runCli(["init"], tmpDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("verist.config.ts");
    expect(stdout).toContain("verist/inputs/sample.json");

    // Config file created
    expect(existsSync(join(tmpDir, "verist.config.ts"))).toBe(true);

    // Sample input created
    const samplePath = join(tmpDir, "verist", "inputs", "sample.json");
    expect(existsSync(samplePath)).toBe(true);
    const sample = JSON.parse(readFileSync(samplePath, "utf-8"));
    expect(sample.text).toContain("jane.smith@example.com");

    // Next steps printed
    expect(stdout).toContain("verist capture");
    expect(stdout).toContain("verist test");
  });

  it("idempotent: running init twice does not overwrite", async () => {
    const first = await runCli(["init"], tmpDir);
    expect(first.exitCode).toBe(0);

    const second = await runCli(["init"], tmpDir);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain("already exists");
  });

  it("full loop: init → capture → test (exit 0)", async () => {
    const init = await runCli(["init"], tmpDir);
    expect(init.exitCode).toBe(0);

    const capture = await runCli(
      ["capture", "--step", "parse-contact", "--input", "verist/inputs/*.json"],
      tmpDir,
    );
    expect(capture.exitCode).toBe(0);
    expect(capture.stdout).toContain("sample");

    const test = await runCli(["test", "--step", "parse-contact"], tmpDir);
    expect(test.exitCode).toBe(0);
  });
});
