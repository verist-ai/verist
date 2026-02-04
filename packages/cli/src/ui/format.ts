// SPDX-License-Identifier: Apache-2.0

import type { RecomputeError, RecomputeResult } from "@verist/replay";
import { formatDiff, formatPath } from "@verist/replay";

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
  const { status, deltaDiff, commandsDiff, schemaViolations } = result;

  const statusLabel = !result.comparable
    ? `${status} (diff unavailable)`
    : status;
  lines.push(`${filename} — ${statusLabel}`);

  if (schemaViolations.length > 0) {
    lines.push("");
    lines.push("  schema violations:");
    for (const v of schemaViolations) {
      lines.push(`    ${formatPath(v.path)}: ${v.kind} (${v.message})`);
    }
  }

  if (deltaDiff && !deltaDiff.equal) {
    lines.push("");
    lines.push("  value changes:");
    // Indent each line of the formatted diff
    lines.push(
      formatDiff(deltaDiff)
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
    );
  }

  if (commandsDiff && !commandsDiff.equal) {
    lines.push("");
    lines.push("  commands changed:");
    lines.push(
      formatDiff(commandsDiff)
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
    );
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
  schemaViolations: number;
  failed: number;
  commandsChanged: number;
  diffUnavailable: number;
}): string {
  const parts: string[] = [];
  parts.push(`${counts.total} baseline(s)`);
  if (counts.passed > 0) parts.push(`${counts.passed} clean`);
  if (counts.changed > 0) parts.push(`${counts.changed} changed`);
  if (counts.schemaViolations > 0)
    parts.push(`${counts.schemaViolations} schema violations`);
  if (counts.commandsChanged > 0)
    parts.push(`${counts.commandsChanged} commands changed`);
  if (counts.diffUnavailable > 0)
    parts.push(`${counts.diffUnavailable} diff unavailable`);
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  return parts.join(", ");
}
