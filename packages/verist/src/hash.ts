// SPDX-License-Identifier: Apache-2.0

import { hashValue, stableStringify } from "./artifact.ts";

/**
 * Compute hash and return both hash and serialized content.
 * Useful when you need to store the content alongside its hash.
 */
export async function hashWithContent(value: unknown): Promise<{
  hash: string;
  content: string;
}> {
  const content = stableStringify(value);
  const hash = await hashValue(value);
  return { hash, content };
}
