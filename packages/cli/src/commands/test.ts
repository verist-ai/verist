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
 * Exits 1 on diffs, 2 on fatal errors, 0 on success.
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

  if (counts.failed > 0) {
    process.exitCode = EXIT_ERROR;
    return;
  }

  const failOnDiff = opts.failOnDiff !== false;
  const failOnCommandsDiff = opts.failOnCommandsDiff !== false;

  const deltaTriggersFail = counts.changed > 0;
  const commandsTriggersFail = counts.commandsChanged && failOnCommandsDiff;

  const shouldFail = failOnDiff && (deltaTriggersFail || commandsTriggersFail);

  if (shouldFail) {
    process.exitCode = EXIT_DIFF;
  }
}
