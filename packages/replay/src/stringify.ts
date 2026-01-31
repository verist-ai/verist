/**
 * Deterministic JSON serialization with sorted object keys.
 * Ensures identical values produce identical strings regardless of key order.
 *
 * Used by both hashing (content-addressable) and display (human-readable diff).
 * Must remain consistent across both use cases to avoid audit confusion.
 */
export function stableStringify(value: unknown): string {
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
