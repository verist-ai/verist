// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "bun:test";
import { isBun, loadConfig } from "./config.ts";

describe("isBun", () => {
  it("returns a boolean", () => {
    expect(typeof isBun()).toBe("boolean");
  });
});

describe("loadConfig", () => {
  it("throws with actionable error when no config file found", async () => {
    await expect(loadConfig("/tmp/nonexistent-dir")).rejects.toThrow(
      "No config file found",
    );
  });

  it("throws with actionable error listing expected filenames", async () => {
    await expect(loadConfig("/tmp/nonexistent-dir")).rejects.toThrow(
      "verist.config.ts",
    );
  });

  it("throws when config step key does not match step.name", async () => {
    const dir = mkdtempSync(join(tmpdir(), "verist-cfg-"));
    writeFileSync(
      join(dir, "verist.config.mjs"),
      `export default {
        steps: { alias: { name: "real-name" } },
        adapters: {},
      };`,
    );
    await expect(loadConfig(dir)).rejects.toThrow(
      'Step key "alias" must match step.name "real-name"',
    );
  });
});
