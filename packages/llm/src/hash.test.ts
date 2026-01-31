import { describe, it, expect } from "bun:test";
import { hashValue } from "./hash";

describe("hashValue", () => {
  it("returns sha256 prefixed hex hash", async () => {
    const hash = await hashValue({ foo: "bar" });
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("produces deterministic hashes for same value", async () => {
    const value = { foo: "bar", baz: 123 };
    const hash1 = await hashValue(value);
    const hash2 = await hashValue(value);
    expect(hash1).toBe(hash2);
  });

  it("produces same hash regardless of key order", async () => {
    const hash1 = await hashValue({ a: 1, b: 2 });
    const hash2 = await hashValue({ b: 2, a: 1 });
    expect(hash1).toBe(hash2);
  });

  it("handles nested objects", async () => {
    const hash1 = await hashValue({ outer: { inner: { deep: "value" } } });
    const hash2 = await hashValue({ outer: { inner: { deep: "value" } } });
    expect(hash1).toBe(hash2);
  });

  it("handles arrays", async () => {
    const hash1 = await hashValue([1, 2, 3]);
    const hash2 = await hashValue([1, 2, 3]);
    expect(hash1).toBe(hash2);
  });

  it("handles primitive values", async () => {
    expect(await hashValue("string")).toMatch(/^sha256:/);
    expect(await hashValue(123)).toMatch(/^sha256:/);
    expect(await hashValue(true)).toMatch(/^sha256:/);
    expect(await hashValue(null)).toMatch(/^sha256:/);
  });

  it("produces different hashes for different values", async () => {
    const hash1 = await hashValue({ foo: "bar" });
    const hash2 = await hashValue({ foo: "baz" });
    expect(hash1).not.toBe(hash2);
  });
});
