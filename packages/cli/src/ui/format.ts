// SPDX-License-Identifier: Apache-2.0

import type { RecomputeError, RecomputeResult } from "@verist/replay";
import { formatDiff } from "@verist/replay";

/**
 * Format an error for CLI output.
 * Shows cause chain when `debug` is true.
 */
export function formatError(error: RecomputeError, debug?: boolean): string {
  let msg = `Error [${error.code}]: ${error.message}`;
  if (debug && error.cause) {
    msg += `\n  Caused by: ${error.cause instanceof Error ? (error.cause.stack ?? error.cause.message) : String(error.cause)}`;
  }
  return msg;
}

/**
 * Format the result of a single baseline recomputation.
 */
export function formatBaselineResult(
  filename: string,
  result: RecomputeResult<unknown>,
): string {
  const lines: string[] = [];

  const { deltaDiff, commandsDiff } = result;

  if (deltaDiff && !deltaDiff.equal) {
    lines.push(`${filename} — delta changed:`);
    lines.push(formatDiff(deltaDiff));
  } else if (deltaDiff?.equal) {
    lines.push(`${filename} — delta unchanged`);
  } else {
    lines.push(`${filename} — delta diff unavailable (hash-only baseline)`);
  }

  if (commandsDiff && !commandsDiff.equal) {
    lines.push(`  commands changed:`);
    lines.push(formatDiff(commandsDiff));
  } else if (commandsDiff?.equal) {
    // Commands match, no output needed
  } else if (commandsDiff === undefined) {
    // Commands not captured — intentionally silent to reduce noise
  }

  return lines.join("\n");
}

/**
 * Compact summary of diff/test results.
 */
export function formatSummary(counts: {
  total: number;
  passed: number;
  changed: number;
  failed: number;
}): string {
  const parts: string[] = [];
  parts.push(`${counts.total} baseline(s)`);
  if (counts.passed > 0) parts.push(`${counts.passed} unchanged`);
  if (counts.changed > 0) parts.push(`${counts.changed} changed`);
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  return parts.join(", ");
}
