// SPDX-License-Identifier: Apache-2.0

import { EXIT_ERROR } from "../exitCodes.ts";
import { runDiffLoop } from "./run-diff.ts";

interface DiffOpts {
  step?: string;
  baseline?: string;
  workflow?: string;
  version?: string;
}

interface GlobalOpts {
  debug?: boolean;
  quiet?: boolean;
}

/**
 * `verist diff` — exploratory mode.
 * Always exits 0 unless a fatal error occurs (exit 2).
 */
export async function diffCommand(
  opts: DiffOpts,
  globalOpts: GlobalOpts,
): Promise<void> {
  const { fatalError } = await runDiffLoop(opts, globalOpts);
  if (fatalError) {
    process.exitCode = EXIT_ERROR;
  }
  // Exit 0 even with diffs — exploratory mode
}
