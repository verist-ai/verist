import { describe, expect, it } from "bun:test";
import { applyDiff, diff, diffEffectiveState, formatDiff } from "./diff.ts";

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

  it("treats undefined as absence in objects", () => {
    // Documented invariant: "undefined values are treated as equivalent to missing keys"
    expect(diff({ a: undefined }, {}).equal).toBe(true);
    expect(diff({}, { a: undefined }).equal).toBe(true);
    expect(diff({ a: undefined }, { a: undefined }).equal).toBe(true);
    expect(diff({ a: 1, b: undefined }, { a: 1 }).equal).toBe(true);
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

  it("treats explicit undefined in arrays same as missing element", () => {
    // Per documented behavior: "undefined values are treated as equivalent to missing keys"
    // This extends to arrays: [1, undefined] is treated same as [1] for diff purposes.
    // Rationale: JSON cannot represent explicit undefined, so distinguishing would
    // break round-trip through serialization.
    const withUndefined = [1, undefined];
    const shorter = [1];

    // Diff detects the length difference but both values are "undefined"
    const result = diff(shorter, withUndefined);
    expect(result.equal).toBe(false);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.path).toEqual([1]);
    expect(result.entries[0]?.before).toBeUndefined();
    expect(result.entries[0]?.after).toBeUndefined();

    // applyDiff treats after:undefined as removal, so result is [1]
    // This is intentional — explicit undefined is not preserved
    const applied = applyDiff(shorter, result);
    expect(applied).toEqual([1]);
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

  it("produces deterministic entry order regardless of object key order", () => {
    // Same keys, different insertion order
    const obj1 = { z: 1, a: 2, m: 3 };
    const obj2: Record<string, number> = {};
    obj2.m = 3;
    obj2.z = 1;
    obj2.a = 2;

    // Diff against a modified version
    const result1 = diff(obj1, { z: 10, a: 20, m: 30 });
    const result2 = diff(obj2, { z: 10, a: 20, m: 30 });

    // Both should produce entries in the same (alphabetical) order
    expect(result1.entries.map((e) => e.path[0])).toEqual(["a", "m", "z"]);
    expect(result2.entries.map((e) => e.path[0])).toEqual(["a", "m", "z"]);
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

  it("throws on invalid path (mismatched base structure)", () => {
    const base = { a: 1 };
    const invalidDiff = {
      equal: false,
      entries: [{ path: ["a", "b"], before: undefined, after: 2 }],
    };
    // Path assumes base.a is an object, but it's a number
    expect(() => applyDiff(base, invalidDiff)).toThrow(/cannot apply change/);
  });

  it("throws on string array index (prevents silent NaN corruption)", () => {
    const base = { items: ["a", "b", "c"] };
    const invalidDiff = {
      equal: false,
      entries: [{ path: ["items", "1"], before: "b", after: undefined }],
    };
    // String "1" instead of number 1 would cause splice(NaN, 1) → delete index 0
    expect(() => applyDiff(base, invalidDiff)).toThrow(
      /array index must be number/,
    );
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

  it("formats objects with deterministic key order", () => {
    const obj: Record<string, number> = {};
    obj.z = 1;
    obj.a = 2;
    obj.m = 3;

    const d = diff({}, { data: obj });
    const formatted = formatDiff(d);

    // Keys should be alphabetically sorted in output
    expect(formatted).toContain('{"a":2,"m":3,"z":1}');
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

  it("handles explicit undefined in overlay (unsets field value)", () => {
    type State = { a: number; b?: number };
    const before = {
      computed: { a: 1, b: 2 } as State,
      overlay: {},
    };
    const after = {
      computed: { a: 1, b: 2 } as State,
      overlay: { b: undefined },
    };

    const result = diffEffectiveState(before, after);

    // Shallow spread: { ...computed, ...overlay }
    // before effective: { a: 1, b: 2 }
    // after effective:  { a: 1, b: undefined }
    // Note: key still present with value undefined (not deleted).
    // JSON serialization will omit the key.
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([
      { path: ["b"], before: 2, after: undefined },
    ]);
  });
});
