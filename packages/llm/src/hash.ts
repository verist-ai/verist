/**
 * Deterministic JSON serialization for hashing.
 * Sorts object keys to ensure consistent output regardless of insertion order.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }

  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys.map(
    (key) =>
      JSON.stringify(key) +
      ":" +
      stableStringify((value as Record<string, unknown>)[key]),
  );
  return "{" + pairs.join(",") + "}";
}

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
 * Uses Web Crypto API (Node.js 18+, Bun, Deno, browsers).
 *
 * Input must be JSON-safe. Undefined values produce undefined behavior.
 * Keys are sorted for deterministic output regardless of insertion order.
 *
 * @returns Hash string in format "sha256:<hex>"
 */
export async function hashValue(value: unknown): Promise<string> {
  const json = stableStringify(value);
  const encoded = new TextEncoder().encode(json);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return `sha256:${toHex(hashBuffer)}`;
}
