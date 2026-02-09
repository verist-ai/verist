// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "bun:test";
import { diff } from "./diff.ts";
import { normalizeForDiff } from "./normalize.ts";

describe("normalizeForDiff", () => {
  it("reordered array with key → equal", () => {
    const before = {
      entities: [
        { id: "e1", text: "John" },
        { id: "e2", text: "Acme" },
      ],
    };
    const after = {
      entities: [
        { id: "e2", text: "Acme" },
        { id: "e1", text: "John" },
      ],
    };
    const keyBy = { entities: "id" } as const;
    const result = diff(
      normalizeForDiff(before, keyBy),
      normalizeForDiff(after, keyBy),
    );
    expect(result.equal).toBe(true);
  });

  it("field change within matched entity → correct path and values", () => {
    const before = {
      entities: [
        { id: "e1", confidence: 0.9 },
        { id: "e2", confidence: 0.8 },
      ],
    };
    const after = {
      entities: [
        { id: "e2", confidence: 0.7 },
        { id: "e1", confidence: 0.9 },
      ],
    };
    const keyBy = { entities: "id" } as const;
    const result = diff(
      normalizeForDiff(before, keyBy),
      normalizeForDiff(after, keyBy),
    );
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([
      { path: ["entities", "e2", "confidence"], before: 0.8, after: 0.7 },
    ]);
  });

  it("entity added → shows as object addition", () => {
    const before = { entities: [{ id: "e1", text: "A" }] };
    const after = {
      entities: [
        { id: "e1", text: "A" },
        { id: "e2", text: "B" },
      ],
    };
    const keyBy = { entities: "id" } as const;
    const result = diff(
      normalizeForDiff(before, keyBy),
      normalizeForDiff(after, keyBy),
    );
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([
      {
        path: ["entities", "e2"],
        before: undefined,
        after: { id: "e2", text: "B" },
      },
    ]);
  });

  it("entity removed → shows as object removal", () => {
    const before = {
      entities: [
        { id: "e1", text: "A" },
        { id: "e2", text: "B" },
      ],
    };
    const after = { entities: [{ id: "e2", text: "B" }] };
    const keyBy = { entities: "id" } as const;
    const result = diff(
      normalizeForDiff(before, keyBy),
      normalizeForDiff(after, keyBy),
    );
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([
      {
        path: ["entities", "e1"],
        before: { id: "e1", text: "A" },
        after: undefined,
      },
    ]);
  });

  it("composite key function → correct matching", () => {
    const before = {
      items: [
        { section: "A", line: 1, text: "foo" },
        { section: "B", line: 2, text: "bar" },
      ],
    };
    const after = {
      items: [
        { section: "B", line: 2, text: "bar" },
        { section: "A", line: 1, text: "foo" },
      ],
    };
    const keyBy = {
      items: (item: unknown) => {
        const i = item as { section: string; line: number };
        return `${i.section}:${i.line}`;
      },
    };
    const result = diff(
      normalizeForDiff(before, keyBy),
      normalizeForDiff(after, keyBy),
    );
    expect(result.equal).toBe(true);
  });

  it("nested dot-path → correct resolution", () => {
    const before = {
      results: { claims: [{ claimId: "c1", text: "X" }] },
    };
    const after = {
      results: { claims: [{ claimId: "c1", text: "Y" }] },
    };
    const keyBy = { "results.claims": "claimId" } as const;
    const result = diff(
      normalizeForDiff(before, keyBy),
      normalizeForDiff(after, keyBy),
    );
    expect(result.equal).toBe(false);
    expect(result.entries).toEqual([
      { path: ["results", "claims", "c1", "text"], before: "X", after: "Y" },
    ]);
  });

  it("duplicate key → throws with message", () => {
    const value = {
      entities: [
        { id: "e1", text: "A" },
        { id: "e1", text: "B" },
      ],
    };
    expect(() => normalizeForDiff(value, { entities: "id" })).toThrow(
      'keyBy: duplicate key "e1" in entities',
    );
  });

  it("missing key field on element → throws with message", () => {
    const value = {
      entities: [{ id: "e1" }, { name: "no-id" }],
    };
    expect(() => normalizeForDiff(value, { entities: "id" })).toThrow(
      'keyBy: element at entities[1] has no field "id"',
    );
  });

  it("key extractor returns non-string/number → throws", () => {
    const value = { items: [{ data: { nested: true } }] };
    expect(() =>
      normalizeForDiff(value, {
        items: (item: unknown) =>
          (item as { data: object }).data as unknown as string,
      }),
    ).toThrow("keyBy: key must be string or number, got object");
  });

  it("key path absent in partial output → silently skipped", () => {
    const value = { other: "data" };
    const result = normalizeForDiff(value, { entities: "id" });
    expect(result).toEqual({ other: "data" });
  });

  it("path resolves to non-array → silently skipped", () => {
    const value = { entities: "not-an-array" };
    const result = normalizeForDiff(value, { entities: "id" });
    expect(result).toEqual({ entities: "not-an-array" });
  });

  it("no keyBy declared → value unchanged", () => {
    const value = { entities: [{ id: "e1" }] };
    expect(normalizeForDiff(value, {})).toBe(value);
  });

  it("non-object intermediate in dot-path → silently skipped", () => {
    const value = { results: "string-not-object" };
    const result = normalizeForDiff(value, { "results.claims": "id" });
    expect(result).toEqual({ results: "string-not-object" });
  });

  it("numeric key from function → works correctly", () => {
    const before = {
      items: [
        { idx: 10, text: "A" },
        { idx: 20, text: "B" },
      ],
    };
    const after = {
      items: [
        { idx: 20, text: "B" },
        { idx: 10, text: "A" },
      ],
    };
    const keyBy = {
      items: (item: unknown) => (item as { idx: number }).idx,
    };
    const result = diff(
      normalizeForDiff(before, keyBy),
      normalizeForDiff(after, keyBy),
    );
    expect(result.equal).toBe(true);
  });
});
