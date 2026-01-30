import type { DiffEntry, DiffResult, LayeredStateInput } from "./types.ts";

/**
 * Generate a structural diff between two values.
 * Recursively compares objects and arrays, producing a list of changes.
 *
 * **Note:** `undefined` values are treated as equivalent to missing keys.
 * `diff({ a: undefined }, {})` returns equal. Avoid storing `undefined`
 * in state if key presence matters.
 *
 * @example
 * ```typescript
 * const result = diff(
 *   { name: "Alice", age: 30 },
 *   { name: "Alice", age: 31 }
 * );
 * // => { equal: false, entries: [{ path: ["age"], before: 30, after: 31 }] }
 * ```
 */
export function diff(before: unknown, after: unknown): DiffResult {
  const entries: DiffEntry[] = [];
  diffRecursive(before, after, [], entries);
  return { equal: entries.length === 0, entries };
}

/**
 * Apply a diff to a base value, producing a new value.
 *
 * **Note:** The diff should be produced from `base` (or a structurally
 * identical value). Applying a diff to an unrelated base is undefined behavior.
 *
 * @example
 * ```typescript
 * const base = { name: "Alice", age: 30 };
 * const d = diff(base, { name: "Alice", age: 31 });
 * const result = applyDiff(base, d);
 * // => { name: "Alice", age: 31 }
 * ```
 */
export function applyDiff<T>(base: T, diffResult: DiffResult): T {
  if (diffResult.equal) return base;

  let result = structuredClone(base) as unknown;

  // Sort entries to apply array removals in descending index order.
  // This prevents index shift issues when removing multiple array elements.
  const sorted = [...diffResult.entries].sort((a, b) => {
    // Removals (after === undefined) at higher indices should be applied first
    const aIsRemoval = a.after === undefined;
    const bIsRemoval = b.after === undefined;
    if (aIsRemoval && bIsRemoval) {
      // Both are removals - compare last path segment if numeric
      const aLast = a.path[a.path.length - 1];
      const bLast = b.path[b.path.length - 1];
      if (typeof aLast === "number" && typeof bLast === "number") {
        return bLast - aLast; // descending order for removals
      }
    }
    return 0; // preserve original order for non-removals
  });

  for (const entry of sorted) {
    result = applyEntry(result, entry);
  }

  return result as T;
}

/**
 * Format diff as human-readable string.
 *
 * @example
 * ```typescript
 * const d = diff({ a: 1 }, { a: 2 });
 * console.log(formatDiff(d));
 * // => "  a: 1 → 2"
 * ```
 */
export function formatDiff(diffResult: DiffResult): string {
  if (diffResult.equal) return "(no changes)";

  return diffResult.entries
    .map((entry) => {
      const path = formatPath(entry.path);
      const before = formatValue(entry.before);
      const after = formatValue(entry.after);

      if (entry.before === undefined) {
        return `+ ${path}: ${after}`;
      }
      if (entry.after === undefined) {
        return `- ${path}: ${before}`;
      }
      return `  ${path}: ${before} → ${after}`;
    })
    .join("\n");
}

function diffRecursive(
  before: unknown,
  after: unknown,
  path: (string | number)[],
  entries: DiffEntry[],
): void {
  // Identical values (including both undefined/null)
  if (before === after) return;

  // Type mismatch or primitive difference
  if (
    typeof before !== typeof after ||
    before === null ||
    after === null ||
    typeof before !== "object"
  ) {
    entries.push({ path: [...path], before, after });
    return;
  }

  // Both are arrays
  if (Array.isArray(before) && Array.isArray(after)) {
    diffArrays(before, after, path, entries);
    return;
  }

  // One is array, other is object
  if (Array.isArray(before) !== Array.isArray(after)) {
    entries.push({ path: [...path], before, after });
    return;
  }

  // Both are objects
  diffObjects(
    before as Record<string, unknown>,
    after as Record<string, unknown>,
    path,
    entries,
  );
}

function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  path: (string | number)[],
  entries: DiffEntry[],
): void {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const beforeVal = before[key];
    const afterVal = after[key];

    if (!(key in before)) {
      // Key added
      entries.push({
        path: [...path, key],
        before: undefined,
        after: afterVal,
      });
    } else if (!(key in after)) {
      // Key removed
      entries.push({
        path: [...path, key],
        before: beforeVal,
        after: undefined,
      });
    } else {
      // Key exists in both, recurse
      diffRecursive(beforeVal, afterVal, [...path, key], entries);
    }
  }
}

function diffArrays(
  before: unknown[],
  after: unknown[],
  path: (string | number)[],
  entries: DiffEntry[],
): void {
  const maxLen = Math.max(before.length, after.length);

  for (let i = 0; i < maxLen; i++) {
    const beforeVal = i < before.length ? before[i] : undefined;
    const afterVal = i < after.length ? after[i] : undefined;

    if (i >= before.length) {
      entries.push({ path: [...path, i], before: undefined, after: afterVal });
    } else if (i >= after.length) {
      entries.push({ path: [...path, i], before: beforeVal, after: undefined });
    } else {
      diffRecursive(beforeVal, afterVal, [...path, i], entries);
    }
  }
}

function applyEntry(value: unknown, entry: DiffEntry): unknown {
  if (entry.path.length === 0) {
    return entry.after;
  }

  const result = structuredClone(value);
  let current: unknown = result;

  for (let i = 0; i < entry.path.length - 1; i++) {
    const key = entry.path[i] as string | number;
    current = (current as Record<string | number, unknown>)[key];
  }

  const lastKey = entry.path[entry.path.length - 1] as string | number;
  if (entry.after === undefined) {
    if (Array.isArray(current)) {
      current.splice(lastKey as number, 1);
    } else {
      delete (current as Record<string, unknown>)[lastKey as string];
    }
  } else {
    (current as Record<string | number, unknown>)[lastKey] = entry.after;
  }

  return result;
}

function formatPath(path: (string | number)[]): string {
  if (path.length === 0) return "(root)";
  return path
    .map((p, i) => (typeof p === "number" ? `[${p}]` : i === 0 ? p : `.${p}`))
    .join("");
}

function formatValue(value: unknown): string {
  if (value === undefined) return "(undefined)";
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Compute effective state from layered state.
 * Overlay values take precedence over computed values.
 */
function toEffective<T extends Record<string, unknown>>(
  state: LayeredStateInput<T>,
): T {
  return { ...state.computed, ...state.overlay };
}

/**
 * Diff two layered states by their effective views.
 *
 * Computes effective state (overlay wins over computed) for each,
 * then produces a structural diff. This is the key operation for
 * detecting changes that affect final decisions.
 *
 * @example
 * ```typescript
 * const before = { computed: { score: 0.7 }, overlay: {} };
 * const after = { computed: { score: 0.8 }, overlay: { score: 0.9 } };
 *
 * const result = diffEffectiveState(before, after);
 * // Compares { score: 0.7 } vs { score: 0.9 }
 * // => { equal: false, entries: [{ path: ["score"], before: 0.7, after: 0.9 }] }
 * ```
 */
export function diffEffectiveState<T extends Record<string, unknown>>(
  before: LayeredStateInput<T>,
  after: LayeredStateInput<T>,
): DiffResult {
  return diff(toEffective(before), toEffective(after));
}
