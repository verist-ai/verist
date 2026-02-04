// SPDX-License-Identifier: Apache-2.0

/**
 * Mulberry32 PRNG — fast 32-bit seeded random number generator.
 * Returns a function that produces values in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * Deterministic sampling via seeded Fisher-Yates shuffle.
 *
 * Returns `count` items from `items` in a deterministic order
 * controlled by `seed`. Original array is not modified.
 *
 * If `count >= items.length`, returns all items in original order.
 */
export function sample<T>(items: T[], count: number, seed: number): T[] {
  if (count <= 0) return [];
  if (count >= items.length) return [...items];

  const arr = [...items];
  const rng = mulberry32(seed);

  // Partial Fisher-Yates: only shuffle `count` positions
  for (let i = arr.length - 1; i > arr.length - 1 - count; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i]!, arr[j]!] = [arr[j]!, arr[i]!];
  }

  return arr.slice(arr.length - count);
}
