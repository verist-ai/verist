import { describe, it, expect } from "bun:test";
import { hashValue, hashWithContent } from "./hash.ts";

describe("hashValue", () => {
  it("returns sha256-prefixed hash", () => {
    const hash = hashValue({ test: "value" });
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("produces deterministic hashes", () => {
    const value = { foo: "bar", count: 42 };
    const hash1 = hashValue(value);
    const hash2 = hashValue(value);
    expect(hash1).toBe(hash2);
  });

  it("produces same hash regardless of key order", () => {
    const hash1 = hashValue({ a: 1, b: 2 });
    const hash2 = hashValue({ b: 2, a: 1 });
    expect(hash1).toBe(hash2);
  });

  it("handles nested objects with consistent ordering", () => {
    const hash1 = hashValue({ outer: { z: 1, a: 2 }, first: true });
    const hash2 = hashValue({ first: true, outer: { a: 2, z: 1 } });
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different values", () => {
    const hash1 = hashValue({ value: 1 });
    const hash2 = hashValue({ value: 2 });
    expect(hash1).not.toBe(hash2);
  });

  it("handles arrays (order matters)", () => {
    const hash1 = hashValue([1, 2, 3]);
    const hash2 = hashValue([3, 2, 1]);
    expect(hash1).not.toBe(hash2);
  });

  it("handles primitives", () => {
    expect(hashValue("hello")).toMatch(/^sha256:/);
    expect(hashValue(42)).toMatch(/^sha256:/);
    expect(hashValue(true)).toMatch(/^sha256:/);
    expect(hashValue(null)).toMatch(/^sha256:/);
  });
});

describe("hashWithContent", () => {
  it("returns both hash and serialized content", () => {
    const { hash, content } = hashWithContent({ name: "test" });
    expect(hash).toMatch(/^sha256:/);
    expect(content).toBe('{"name":"test"}');
  });

  it("content is deterministically serialized", () => {
    const { content } = hashWithContent({ z: 1, a: 2 });
    expect(content).toBe('{"a":2,"z":1}');
  });

  it("hash matches hashValue", () => {
    const value = { foo: "bar" };
    const { hash } = hashWithContent(value);
    expect(hash).toBe(hashValue(value));
  });
});
