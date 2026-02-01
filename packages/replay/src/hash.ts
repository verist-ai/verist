// SPDX-License-Identifier: Apache-2.0

import { stableStringify } from "./stringify.ts";

/**
 * Convert ArrayBuffer to hex string.
 */
function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Compute SHA-256 hash of a JSON-serializable value.
 * Uses Web Crypto API for cross-platform support (Node 20+, Bun, Deno, browsers).
 *
 * **Serialization behavior:**
 * - Top-level `undefined` → normalized to `null`
 * - `undefined` in objects → key omitted (treated as absence, consistent with diff)
 * - `undefined` in arrays → `null` (per JSON spec)
 * - Functions, symbols, circular refs → not supported (use Zod-validated data)
 *
 * @example
 * ```typescript
 * const hash = await hashValue({ name: "Alice", age: 30 });
 * // => "sha256:7d1a54..."
 * ```
 */
export async function hashValue(value: unknown): Promise<string> {
  const json = stableStringify(value);
  const encoded = new TextEncoder().encode(json);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return `sha256:${toHex(hashBuffer)}`;
}

/**
 * Compute hash and return both hash and serialized content.
 * Useful when you need to store the content alongside its hash.
 */
export async function hashWithContent(value: unknown): Promise<{
  hash: string;
  content: string;
}> {
  const content = stableStringify(value);
  const encoded = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return { hash: `sha256:${toHex(hashBuffer)}`, content };
}
