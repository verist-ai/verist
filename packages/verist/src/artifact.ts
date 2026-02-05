// SPDX-License-Identifier: Apache-2.0

/**
 * Classification of what an artifact represents.
 *
 * **Reserved by kernel:**
 * - `"step-output"` — step's delta + events, used by replay/recompute
 * - `"step-commands"` — step's commands, used by recompute command diffing
 *
 * **User-defined:** Any other value (e.g., `"llm-input"`, `"llm-output"`) is
 * opaque metadata for audit/tracing. The kernel does not interpret these.
 */
export type ArtifactKind = "step-output" | "step-commands" | (string & {});

/**
 * Artifact emitted during step execution.
 * Used for replay and audit. Core emits `step-output`; adapters emit their own.
 */
export interface Artifact {
  /** SHA-256 hash of the content (e.g., "sha256:abc123...") */
  hash: string;
  /** @see ArtifactKind */
  kind: ArtifactKind;
  /** The actual content. Optional for compliance scenarios where content cannot be persisted. */
  content?: unknown;
}

/**
 * Callback for capturing artifacts during step execution.
 * Passed to adapters via context. Core calls it for step-output.
 */
export type OnArtifact = (artifact: Artifact) => void;

/**
 * Kernel-level serialization primitive.
 *
 * Deterministic JSON serialization with sorted object keys.
 * Ensures identical values produce identical strings regardless of key order.
 * **Always returns a string** — top-level `undefined` is normalized to `"null"`.
 *
 * Its semantics are part of Verist kernel invariants (see SPEC-overview) and must not change.
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
 * Uses `stableStringify` which normalizes `undefined` to `null`.
 */
export async function hashValue(value: unknown): Promise<string> {
  const json = stableStringify(value);
  const encoded = new TextEncoder().encode(json);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return `sha256:${toHex(hashBuffer)}`;
}

/**
 * Create an artifact from a value.
 */
export async function createArtifact(
  kind: string,
  content: unknown,
): Promise<Artifact> {
  return {
    hash: await hashValue(content),
    kind,
    content,
  };
}
