import { describe, it, expect } from "bun:test";
import { diff, applyDiff, formatDiff, diffEffectiveState } from "./diff.ts";

describe("diff", () => {
  it("returns equal for identical primitives", () => {
    expect(diff(42, 42).equal).toBe(true);
    expect(diff("hello", "hello").equal).toBe(true);
    expect(diff(true, true).equal).toBe(true);
    expect(diff(null, null).equal).toBe(true);
  });

  it("detects primitive differences", () => {
    const result = diff(1, 2);
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([{ path: [], before: 1, after: 2 }]);
  });

  it("returns equal for identical objects", () => {
    const result = diff({ a: 1, b: 2 }, { a: 1, b: 2 });
    expect(result.equal).toBe(true);
    expect(result.entries).toEqual([]);
  });

  it("detects changed object fields", () => {
    const result = diff({ name: "Alice", age: 30 }, { name: "Alice", age: 31 });
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([{ path: ["age"], before: 30, after: 31 }]);
  });

  it("detects added fields", () => {
    const result = diff({ a: 1 }, { a: 1, b: 2 });
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([
      { path: ["b"], before: undefined, after: 2 },
    ]);
  });

  it("detects removed fields", () => {
    const result = diff({ a: 1, b: 2 }, { a: 1 });
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([
      { path: ["b"], before: 2, after: undefined },
    ]);
  });

  it("handles nested objects", () => {
    const result = diff({ outer: { inner: 1 } }, { outer: { inner: 2 } });
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([
      { path: ["outer", "inner"], before: 1, after: 2 },
    ]);
  });

  it("returns equal for identical arrays", () => {
    const result = diff([1, 2, 3], [1, 2, 3]);
    expect(result.equal).toBe(true);
  });

  it("detects array element changes", () => {
    const result = diff([1, 2, 3], [1, 5, 3]);
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([{ path: [1], before: 2, after: 5 }]);
  });

  it("detects array additions", () => {
    const result = diff([1, 2], [1, 2, 3]);
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([
      { path: [2], before: undefined, after: 3 },
    ]);
  });

  it("detects array removals", () => {
    const result = diff([1, 2, 3], [1, 2]);
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([
      { path: [2], before: 3, after: undefined },
    ]);
  });

  it("handles arrays of objects", () => {
    const result = diff([{ id: 1, name: "a" }], [{ id: 1, name: "b" }]);
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([
      { path: [0, "name"], before: "a", after: "b" },
    ]);
  });

  it("handles type changes", () => {
    const result = diff({ a: 1 }, { a: "1" });
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([{ path: ["a"], before: 1, after: "1" }]);
  });

  it("handles null to value", () => {
    const result = diff(null, { a: 1 });
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([
      { path: [], before: null, after: { a: 1 } },
    ]);
  });

  it("handles value to null", () => {
    const result = diff({ a: 1 }, null);
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([
      { path: [], before: { a: 1 }, after: null },
    ]);
  });
});

describe("applyDiff", () => {
  it("returns base for equal diff", () => {
    const base = { a: 1 };
    const d = diff(base, base);
    const result = applyDiff(base, d);
    expect(result).toEqual(base);
  });

  it("applies field change", () => {
    const base = { name: "Alice", age: 30 };
    const d = diff(base, { name: "Alice", age: 31 });
    const result = applyDiff(base, d);
    expect(result).toEqual({ name: "Alice", age: 31 });
  });

  it("applies field addition", () => {
    const base = { a: 1 } as { a: number; b?: number };
    const d = diff(base, { a: 1, b: 2 });
    const result = applyDiff(base, d);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("applies field removal", () => {
    const base = { a: 1, b: 2 } as { a: number; b?: number };
    const d = diff(base, { a: 1 });
    const result = applyDiff(base, d);
    expect(result).toEqual({ a: 1 });
  });

  it("applies nested changes", () => {
    const base = { outer: { inner: 1 } };
    const d = diff(base, { outer: { inner: 2 } });
    const result = applyDiff(base, d);
    expect(result).toEqual({ outer: { inner: 2 } });
  });

  it("applies array changes", () => {
    const base = [1, 2, 3];
    const d = diff(base, [1, 5, 3]);
    const result = applyDiff(base, d);
    expect(result).toEqual([1, 5, 3]);
  });

  it("does not mutate original", () => {
    const base = { a: 1, b: 2 };
    const d = diff(base, { a: 1, b: 3 });
    applyDiff(base, d);
    expect(base).toEqual({ a: 1, b: 2 });
  });

  it("handles multiple array removals correctly", () => {
    const base = ["a", "b", "c", "d"];
    const target = ["a"];
    const d = diff(base, target);
    const result = applyDiff(base, d);
    expect(result).toEqual(target);
  });

  it("handles mixed array additions and removals", () => {
    const base = ["a", "b", "c"];
    const target = ["a", "x"];
    const d = diff(base, target);
    const result = applyDiff(base, d);
    expect(result).toEqual(target);
  });
});

describe("formatDiff", () => {
  it("returns no changes message for equal diff", () => {
    const d = diff({ a: 1 }, { a: 1 });
    expect(formatDiff(d)).toBe("(no changes)");
  });

  it("formats field change", () => {
    const d = diff({ age: 30 }, { age: 31 });
    expect(formatDiff(d)).toBe("  age: 30 → 31");
  });

  it("formats field addition", () => {
    const d = diff({}, { name: "Alice" });
    expect(formatDiff(d)).toBe('+ name: "Alice"');
  });

  it("formats field removal", () => {
    const d = diff({ name: "Alice" }, {});
    expect(formatDiff(d)).toBe('- name: "Alice"');
  });

  it("formats nested path", () => {
    const d = diff({ user: { name: "A" } }, { user: { name: "B" } });
    expect(formatDiff(d)).toBe('  user.name: "A" → "B"');
  });

  it("formats array index path", () => {
    const d = diff([1, 2], [1, 3]);
    expect(formatDiff(d)).toBe("  [1]: 2 → 3");
  });

  it("formats null values", () => {
    const d = diff({ a: null }, { a: 1 });
    expect(formatDiff(d)).toBe("  a: null → 1");
  });

  it("formats multiple changes", () => {
    const d = diff({ a: 1, b: 2 }, { a: 2, b: 3 });
    expect(formatDiff(d)).toBe("  a: 1 → 2\n  b: 2 → 3");
  });
});

describe("diffEffectiveState", () => {
  it("compares effective states (overlay wins)", () => {
    const before = { computed: { score: 0.7 }, overlay: {} };
    const after = { computed: { score: 0.8 }, overlay: { score: 0.9 } };

    const result = diffEffectiveState(before, after);

    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([
      { path: ["score"], before: 0.7, after: 0.9 },
    ]);
  });

  it("returns equal when effective states match despite different layers", () => {
    const before = {
      computed: { value: 10 },
      overlay: { value: 20 },
    };
    const after = {
      computed: { value: 999 }, // different computed
      overlay: { value: 20 }, // same overlay, so effective is same
    };

    const result = diffEffectiveState(before, after);
    expect(result.equal).toBe(true);
  });

  it("detects changes in computed when overlay is empty", () => {
    const before = { computed: { a: 1, b: 2 }, overlay: {} };
    const after = { computed: { a: 1, b: 3 }, overlay: {} };

    const result = diffEffectiveState(before, after);

    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([{ path: ["b"], before: 2, after: 3 }]);
  });

  it("handles overlay overriding computed in both states", () => {
    const before = {
      computed: { status: "pending" },
      overlay: { status: "approved" },
    };
    const after = {
      computed: { status: "pending" },
      overlay: { status: "rejected" },
    };

    const result = diffEffectiveState(before, after);

    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([
      { path: ["status"], before: "approved", after: "rejected" },
    ]);
  });

  it("handles multi-field state", () => {
    type State = { score: number; confidence: number; label: string };
    const before = {
      computed: { score: 0.8, confidence: 0.9, label: "A" } as State,
      overlay: { confidence: 0.95 },
    };
    const after = {
      computed: { score: 0.85, confidence: 0.9, label: "B" } as State,
      overlay: { confidence: 0.95 },
    };

    const result = diffEffectiveState(before, after);

    // effective before: { score: 0.8, confidence: 0.95, label: "A" }
    // effective after:  { score: 0.85, confidence: 0.95, label: "B" }
    expect(result.equal).toBe(false);
    expect(result.entries).toHaveLength(2);
    expect(result.entries).toContainEqual({
      path: ["score"],
      before: 0.8,
      after: 0.85,
    });
    expect(result.entries).toContainEqual({
      path: ["label"],
      before: "A",
      after: "B",
    });
  });
});
