import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFilesystem } from "./filesystem.ts";

describe("createFilesystem", () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "verist-artifacts-test-"));
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  test("put stores content and returns ref with hash", async () => {
    const store = createFilesystem({ basePath });
    const content = new TextEncoder().encode("hello world");

    const result = await store.put(content, "text/plain");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.value.size).toBe(11);
    expect(result.value.contentType).toBe("text/plain");
    expect(result.value.createdAt).toBeInstanceOf(Date);
  });

  test("put is idempotent (same content → same ref)", async () => {
    const store = createFilesystem({ basePath });
    const content = new TextEncoder().encode("duplicate content");

    const result1 = await store.put(content, "text/plain");
    const result2 = await store.put(content, "text/plain");

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (!result1.ok || !result2.ok) return;

    expect(result1.value.hash).toBe(result2.value.hash);
    expect(result1.value.size).toBe(result2.value.size);
  });

  test("get retrieves artifact by hash", async () => {
    const store = createFilesystem({ basePath });
    const content = new TextEncoder().encode("retrievable content");

    const putResult = await store.put(content, "text/plain");
    expect(putResult.ok).toBe(true);
    if (!putResult.ok) return;

    const getResult = await store.get(putResult.value.hash);

    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;

    expect(getResult.value).not.toBeNull();
    expect(getResult.value!.ref.hash).toBe(putResult.value.hash);
    expect(getResult.value!.ref.contentType).toBe("text/plain");
    expect(new TextDecoder().decode(getResult.value!.content)).toBe(
      "retrievable content",
    );
  });

  test("get returns null for non-existent hash", async () => {
    const store = createFilesystem({ basePath });
    const fakeHash = "sha256:" + "a".repeat(64);

    const result = await store.get(fakeHash);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });

  test("get detects corruption via hash mismatch", async () => {
    const store = createFilesystem({ basePath });
    const content = new TextEncoder().encode("original content");

    const putResult = await store.put(content, "text/plain");
    expect(putResult.ok).toBe(true);
    if (!putResult.ok) return;

    // Corrupt the content file
    const hex = putResult.value.hash.replace("sha256:", "");
    const contentPath = join(basePath, "artifacts", hex);
    await writeFile(contentPath, "corrupted content");

    const getResult = await store.get(putResult.value.hash);

    expect(getResult.ok).toBe(false);
    if (getResult.ok) return;
    expect(getResult.error.code).toBe("hash_mismatch");
    expect(getResult.error.message).toContain("Content corrupted");
  });

  test("round-trip preserves binary content", async () => {
    const store = createFilesystem({ basePath });
    // Binary content with various byte values
    const content = new Uint8Array([0, 1, 127, 128, 255, 0, 42]);

    const putResult = await store.put(content, "application/octet-stream");
    expect(putResult.ok).toBe(true);
    if (!putResult.ok) return;

    const getResult = await store.get(putResult.value.hash);
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;

    expect(getResult.value!.content).toEqual(content);
  });
});
