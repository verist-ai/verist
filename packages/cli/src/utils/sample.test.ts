// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "bun:test";
import { sample } from "./sample.ts";

describe("sample", () => {
  it("returns deterministic results for same seed", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = sample(items, 3, 42);
    const b = sample(items, 3, 42);
    expect(a).toEqual(b);
  });

  it("returns different results for different seeds", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = sample(items, 3, 42);
    const b = sample(items, 3, 99);
    // Different seeds should (very likely) produce different selections
    expect(a).not.toEqual(b);
  });

  it("returns exactly count items", () => {
    const items = ["a", "b", "c", "d", "e"];
    const result = sample(items, 2, 1);
    expect(result).toHaveLength(2);
  });

  it("returns all items when count >= length", () => {
    const items = [1, 2, 3];
    const result = sample(items, 5, 42);
    expect(result).toHaveLength(3);
    expect(result.sort()).toEqual([1, 2, 3]);
  });

  it("returns empty array for count 0", () => {
    expect(sample([1, 2, 3], 0, 42)).toEqual([]);
  });

  it("returns empty array for negative count", () => {
    expect(sample([1, 2, 3], -1, 42)).toEqual([]);
  });

  it("does not modify original array", () => {
    const items = [1, 2, 3, 4, 5];
    const copy = [...items];
    sample(items, 3, 42);
    expect(items).toEqual(copy);
  });

  it("handles single element", () => {
    expect(sample(["x"], 1, 42)).toEqual(["x"]);
  });

  it("handles empty array", () => {
    expect(sample([], 3, 42)).toEqual([]);
  });

  it("sampled items are a subset of original", () => {
    const items = [10, 20, 30, 40, 50];
    const result = sample(items, 3, 42);
    for (const r of result) {
      expect(items).toContain(r);
    }
  });
});
