import { createHash } from "node:crypto";
import { stableStringify } from "./stringify.ts";

/**
 * Compute SHA-256 hash of a JSON-serializable value.
 * Uses deterministic JSON serialization (sorted keys) for consistency.
 *
 * **Serialization behavior:**
 * - `undefined` in objects → key omitted (treated as absence, consistent with diff)
 * - `undefined` in arrays → `null` (per JSON spec)
 * - Functions, symbols, circular refs → not supported (use Zod-validated data)
 *
 * @example
 * ```typescript
 * const hash = hashValue({ name: "Alice", age: 30 });
 * // => "sha256:7d1a54..."
 * ```
 */
export function hashValue(value: unknown): string {
  const json = stableStringify(value);
  const hash = createHash("sha256").update(json).digest("hex");
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
  const hash = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  return { hash, content };
}
