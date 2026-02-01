// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "bun:test";
import { hashValue, hashWithContent } from "./hash.ts";

describe("hashValue", () => {
  it("returns sha256-prefixed hash", async () => {
    const hash = await hashValue({ test: "value" });
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("produces deterministic hashes", async () => {
    const value = { foo: "bar", count: 42 };
    const hash1 = await hashValue(value);
    const hash2 = await hashValue(value);
    expect(hash1).toBe(hash2);
  });

  it("produces same hash regardless of key order", async () => {
    const hash1 = await hashValue({ a: 1, b: 2 });
    const hash2 = await hashValue({ b: 2, a: 1 });
    expect(hash1).toBe(hash2);
  });

  it("handles nested objects with consistent ordering", async () => {
    const hash1 = await hashValue({ outer: { z: 1, a: 2 }, first: true });
    const hash2 = await hashValue({ first: true, outer: { a: 2, z: 1 } });
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different values", async () => {
    const hash1 = await hashValue({ value: 1 });
    const hash2 = await hashValue({ value: 2 });
    expect(hash1).not.toBe(hash2);
  });

  it("handles arrays (order matters)", async () => {
    const hash1 = await hashValue([1, 2, 3]);
    const hash2 = await hashValue([3, 2, 1]);
    expect(hash1).not.toBe(hash2);
  });

  it("handles primitives", async () => {
    expect(await hashValue("hello")).toMatch(/^sha256:/);
    expect(await hashValue(42)).toMatch(/^sha256:/);
    expect(await hashValue(true)).toMatch(/^sha256:/);
    expect(await hashValue(null)).toMatch(/^sha256:/);
  });
});

describe("hashWithContent", () => {
  it("returns both hash and serialized content", async () => {
    const { hash, content } = await hashWithContent({ name: "test" });
    expect(hash).toMatch(/^sha256:/);
    expect(content).toBe('{"name":"test"}');
  });

  it("content is deterministically serialized", async () => {
    const { content } = await hashWithContent({ z: 1, a: 2 });
    expect(content).toBe('{"a":2,"z":1}');
  });

  it("hash matches hashValue", async () => {
    const value = { foo: "bar" };
    const { hash } = await hashWithContent(value);
    expect(hash).toBe(await hashValue(value));
  });
});
