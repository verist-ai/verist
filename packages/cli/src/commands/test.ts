// SPDX-License-Identifier: Apache-2.0

import { EXIT_DIFF, EXIT_ERROR } from "../exitCodes.ts";
import { runDiffLoop } from "./run-diff.ts";

interface TestOpts {
  step?: string;
  baseline?: string;
  workflow?: string;
  version?: string;
  failOnDiff?: boolean;
  failOnCommandsDiff?: boolean;
}

interface GlobalOpts {
  debug?: boolean;
  quiet?: boolean;
}

/**
 * `verist test` — CI mode.
 *
 * Exit codes:
 * - 0 = clean (no regressions per policy)
 * - 1 = regressions detected (schema violations always; value changes unless
 *       --no-fail-on-diff; command changes unless --no-fail-on-commands-diff)
 * - 2 = infrastructure failure (config error, execution crash, corrupted baseline)
 */
export async function testCommand(
  opts: TestOpts,
  globalOpts: GlobalOpts,
): Promise<void> {
  const { counts, fatalError } = await runDiffLoop(opts, globalOpts);

  if (fatalError) {
    process.exitCode = EXIT_ERROR;
    return;
  }

  // Any failed baseline (corrupted, unreadable, execution crash) is infrastructure failure.
  if (counts.failed > 0) {
    process.exitCode = EXIT_ERROR;
    return;
  }

  const failOnDiff = opts.failOnDiff !== false;
  const failOnCommandsDiff = opts.failOnCommandsDiff !== false;

  // Schema violations always trigger failure (exit 1, not exit 2)
  const schemaViolationsFail = counts.schemaViolations > 0;
  const deltaTriggersFail = counts.changed > 0;
  const commandsTriggersFail = counts.commandsChanged > 0 && failOnCommandsDiff;

  // Each concern is independent: schema violations are always fatal,
  // value diffs respect --no-fail-on-diff, commands respect --no-fail-on-commands-diff.
  const shouldFail =
    schemaViolationsFail ||
    (failOnDiff && deltaTriggersFail) ||
    commandsTriggersFail;

  if (shouldFail) {
    process.exitCode = EXIT_DIFF;
  }
}
