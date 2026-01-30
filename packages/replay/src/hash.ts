/**
 * Compute SHA-256 hash of a JSON-serializable value.
 * Uses deterministic JSON serialization (sorted keys) for consistency.
 *
 * @example
 * ```typescript
 * const hash = hashValue({ name: "Alice", age: 30 });
 * // => "sha256:7d1a54..."
 * ```
 */
export function hashValue(value: unknown): string {
  const json = stableStringify(value);
  const hash = computeSha256(json);
  return `sha256:${hash}`;
}

/**
 * Compute hash and return both hash and serialized content.
 * Useful when you need to store the content alongside its hash.
 */
export function hashWithContent(value: unknown): {
  hash: string;
  content: string;
} {
  const content = stableStringify(value);
  const hash = `sha256:${computeSha256(content)}`;
  return { hash, content };
}

/**
 * Deterministic JSON serialization with sorted object keys.
 * Ensures identical values produce identical strings regardless of key order.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v)
        .sort()
        .reduce(
          (sorted, key) => {
            sorted[key] = (v as Record<string, unknown>)[key];
            return sorted;
          },
          {} as Record<string, unknown>,
        );
    }
    return v;
  });
}

/**
 * Compute SHA-256 hash of a string.
 * Returns hex-encoded hash.
 */
function computeSha256(input: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex");
}
