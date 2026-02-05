// SPDX-License-Identifier: Apache-2.0

import type { DiffResult, RecomputeStatus, SchemaViolation } from "verist";
import type { DiffCounts } from "../commands/run-diff.ts";
import { formatSummary } from "./format.ts";

/**
 * Per-baseline result for machine-readable output.
 */
export interface BaselineEntry {
  filename: string;
  status: RecomputeStatus | "failed";
  comparable: boolean;
  schemaViolations: SchemaViolation[];
  outputDiff: DiffResult | null;
  commandsDiff: DiffResult | null;
  /** Error message when status is "failed". */
  error?: string;
}

/**
 * Stable JSON output schema for CI integrations.
 *
 * Status semantics:
 * - `"pass"` — all baselines clean, no regressions
 * - `"fail"` — regressions detected (value changes, schema violations, command changes)
 * - `"error"` — infrastructure failure (corrupted baselines, execution crashes)
 */
export interface MachineOutput {
  version: 1;
  step: string;
  status: "pass" | "fail" | "error";
  /** Human-readable one-line summary (e.g., "5 baseline(s), 3 clean, 2 changed"). */
  summary: string;
  counts: DiffCounts;
  baselines: BaselineEntry[];
}

/**
 * Format results as stable JSON for CI consumption.
 */
export function formatJson(
  step: string,
  counts: DiffCounts,
  baselines: BaselineEntry[],
): string {
  const output: MachineOutput = {
    version: 1,
    step,
    status: deriveStatus(counts),
    summary: formatSummary(counts),
    counts,
    baselines,
  };
  return JSON.stringify(output, null, 2);
}

/**
 * Format results as compact markdown table for PR comments.
 */
export function formatMarkdown(
  step: string,
  counts: DiffCounts,
  baselines: BaselineEntry[],
): string {
  const status = deriveStatus(counts);
  const lines: string[] = [];

  const label =
    status === "pass" ? "Pass" : status === "fail" ? "Fail" : "Error";
  lines.push(`### Verist \`${step}\` — ${label}`);
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("| --- | --- |");
  lines.push(`| Total | ${counts.total} |`);
  if (counts.passed > 0) lines.push(`| Clean | ${counts.passed} |`);
  if (counts.changed > 0) lines.push(`| Changed | ${counts.changed} |`);
  if (counts.schemaViolations > 0)
    lines.push(`| Schema violations | ${counts.schemaViolations} |`);
  if (counts.commandsChanged > 0)
    lines.push(`| Commands changed | ${counts.commandsChanged} |`);
  if (counts.diffUnavailable > 0)
    lines.push(`| Diff unavailable | ${counts.diffUnavailable} |`);
  if (counts.failed > 0) lines.push(`| Failed | ${counts.failed} |`);

  // Regressions: value changes, schema violations
  const regressions = baselines.filter(
    (b) => b.status === "value_changed" || b.status === "schema_violation",
  );
  if (regressions.length > 0) {
    lines.push("");
    lines.push("#### Regressions");
    lines.push("");
    for (const b of regressions) {
      lines.push(`- \`${b.filename}\` — ${b.status}`);
    }
  }

  // Infrastructure errors
  const errors = baselines.filter((b) => b.status === "failed");
  if (errors.length > 0) {
    lines.push("");
    lines.push("#### Errors");
    lines.push("");
    for (const b of errors) {
      lines.push(`- \`${b.filename}\` — ${b.error ?? b.status}`);
    }
  }

  return lines.join("\n");
}

function deriveStatus(counts: DiffCounts): "pass" | "fail" | "error" {
  // Infrastructure failures take precedence
  if (counts.failed > 0) return "error";
  // Regressions detected
  if (
    counts.changed > 0 ||
    counts.schemaViolations > 0 ||
    counts.commandsChanged > 0
  )
    return "fail";
  return "pass";
}
