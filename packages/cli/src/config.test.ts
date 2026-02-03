// SPDX-License-Identifier: Apache-2.0

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
});
