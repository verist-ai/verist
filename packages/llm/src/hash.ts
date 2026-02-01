// SPDX-License-Identifier: Apache-2.0

import { stableStringify } from "@verist/core";

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
 * Uses Web Crypto API (Node 20+, Bun, Deno, browsers).
 *
 * Uses shared `stableStringify` from @verist/core for consistency
 * across all packages. `stableStringify` normalizes `undefined` to `null`.
 *
 * @returns Hash string in format "sha256:<hex>"
 */
export async function hashValue(value: unknown): Promise<string> {
  const json = stableStringify(value);
  const encoded = new TextEncoder().encode(json);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return `sha256:${toHex(hashBuffer)}`;
}
