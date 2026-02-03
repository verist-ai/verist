// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "bun:test";
import { baselineDir, baselineFilename, normalizeName } from "./paths.ts";

describe("normalizeName", () => {
  it("lowercases and strips non-alphanumeric", () => {
    expect(normalizeName("My Input File")).toBe("my-input-file");
  });

  it("strips diacritics via NFKD", () => {
    expect(normalizeName("café résumé")).toBe("cafe-resume");
  });

  it("collapses consecutive hyphens", () => {
    expect(normalizeName("a---b___c")).toBe("a-b-c");
  });

  it("trims leading/trailing hyphens", () => {
    expect(normalizeName("--hello--")).toBe("hello");
  });

  it("caps at 64 characters", () => {
    const long = "a".repeat(100);
    const result = normalizeName(long);
    expect(result.length).toBeLessThanOrEqual(64);
    expect(result).toBe("a".repeat(64));
  });

  it("falls back to 'input' for empty string", () => {
    expect(normalizeName("")).toBe("input");
  });

  it("falls back to 'input' for all-special characters", () => {
    expect(normalizeName("!!!")).toBe("input");
  });

  it("handles unicode characters", () => {
    expect(normalizeName("日本語テスト")).toBe("input");
  });

  it("handles mixed unicode and ascii", () => {
    expect(normalizeName("test-日本語-data")).toBe("test-data");
  });
});

describe("baselineDir", () => {
  it("produces correct directory path", () => {
    const dir = baselineDir("/project", "my-wf", "1.0.0", "extract");
    expect(dir).toBe("/project/.verist/baselines/my-wf/1.0.0/extract");
  });
});

describe("baselineFilename", () => {
  it("produces deterministic filename from path and hash", () => {
    const hash = "sha256:abcdef0123456789";
    const name1 = baselineFilename("data/input.json", hash);
    const name2 = baselineFilename("data/input.json", hash);
    expect(name1).toBe(name2);
    expect(name1).toBe("input-abcdef01.json");
  });

  it("produces different filenames for different hashes", () => {
    const name1 = baselineFilename("input.json", "sha256:aaaa0000bbbb1111");
    const name2 = baselineFilename("input.json", "sha256:cccc2222dddd3333");
    expect(name1).not.toBe(name2);
  });
});
