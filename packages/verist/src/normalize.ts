// SPDX-License-Identifier: Apache-2.0

import type { KeyFn } from "./types.ts";

/**
 * Normalize value for identity-aware diffing.
 * Converts arrays at keyed paths to `Record<key, element>`,
 * so the existing `diff()` compares by identity instead of by index.
 *
 * Normalization is transient — only used at comparison time.
 * Stored artifacts always contain the original arrays.
 *
 * Paths that don't resolve (missing or non-object intermediate) are
 * silently skipped — expected for `Partial<T>` outputs.
 * Paths that resolve to a non-array are also silently skipped.
 */
export function normalizeForDiff<T>(
  value: T,
  keyBy: Readonly<Record<string, KeyFn>>,
): T {
  const paths = Object.keys(keyBy);
  if (paths.length === 0) return value;

  // Shallow-clone the root if it's an object (we may replace nested fields)
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  let result: Record<string, unknown> = { ...(value as object) };

  for (const dotPath of paths) {
    const fn = keyBy[dotPath]!;
    result = applyKeyAt(result, dotPath.split("."), 0, fn);
  }

  return result as T;
}

/**
 * Recursively walk the path segments, shallow-cloning each intermediate
 * object, and convert the terminal array to a keyed record.
 */
function applyKeyAt(
  obj: Record<string, unknown>,
  segments: string[],
  index: number,
  keyFn: KeyFn,
): Record<string, unknown> {
  const key = segments[index]!;

  if (!(key in obj)) return obj; // path doesn't resolve — skip

  const child = obj[key] as unknown;

  if (index === segments.length - 1) {
    // Terminal segment — must be an array to normalize
    if (!Array.isArray(child)) return obj;
    return { ...obj, [key]: arrayToRecord(child, keyFn, segments.join(".")) };
  }

  // Intermediate segment — must be a plain object to traverse
  if (child === null || typeof child !== "object" || Array.isArray(child)) {
    return obj; // non-object intermediate — skip
  }

  const nested = applyKeyAt(
    child as Record<string, unknown>,
    segments,
    index + 1,
    keyFn,
  );
  if (nested === child) return obj; // no change — avoid unnecessary clone
  return { ...obj, [key]: nested };
}

/**
 * Convert an array to `Record<key, element>` using the key extractor.
 * Throws on duplicate keys or missing/invalid key values.
 */
function arrayToRecord(
  arr: unknown[],
  keyFn: KeyFn,
  pathLabel: string,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  for (let i = 0; i < arr.length; i++) {
    const element = arr[i];
    let rawKey: unknown;

    if (typeof keyFn === "string") {
      if (
        element === null ||
        typeof element !== "object" ||
        !(keyFn in element)
      ) {
        throw new Error(
          `keyBy: element at ${pathLabel}[${i}] has no field "${keyFn}"`,
        );
      }
      rawKey = (element as Record<string, unknown>)[keyFn];
    } else {
      rawKey = keyFn(element);
    }

    if (typeof rawKey !== "string" && typeof rawKey !== "number") {
      throw new Error(
        `keyBy: key must be string or number, got ${typeof rawKey}`,
      );
    }

    const keyStr = String(rawKey);
    if (keyStr in record) {
      throw new Error(`keyBy: duplicate key "${keyStr}" in ${pathLabel}`);
    }

    record[keyStr] = element;
  }

  return record;
}
