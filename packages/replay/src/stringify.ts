// SPDX-License-Identifier: Apache-2.0

/**
 * Deterministic JSON serialization with sorted object keys.
 * Ensures identical values produce identical strings regardless of key order.
 *
 * **Always returns a string** — top-level `undefined` is normalized to `"null"`.
 *
 * Used by both hashing (content-addressable) and display (human-readable diff).
 * Must remain consistent across both use cases to avoid audit confusion.
 */
export function stableStringify(value: unknown): string {
  // Normalize top-level undefined to null (JSON.stringify(undefined) returns undefined)
  const normalized = value === undefined ? null : value;
  return JSON.stringify(normalized, (_, v) => {
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
