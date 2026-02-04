// SPDX-License-Identifier: Apache-2.0

import type { Result } from "@verist/core";
import { createContextFactory } from "@verist/core";
import type { RecomputeError, RecomputeResult } from "@verist/replay";
import { recompute } from "@verist/replay";
import { existsSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { baselineDir, listBaselines, readBaseline } from "../baseline/index.ts";
import type { VeristConfig } from "../config.ts";
import { loadConfig } from "../config.ts";
import type { BaselineEntry } from "../ui/index.ts";
import {
  formatBaselineResult,
  formatError,
  formatJson,
  formatMarkdown,
  formatSummary,
} from "../ui/index.ts";

interface DiffOpts {
  step?: string;
  baseline?: string;
  workflow?: string;
  version?: string;
  label?: string;
  format?: "text" | "json" | "markdown";
  meta?: string[];
}

interface GlobalOpts {
  debug?: boolean;
  quiet?: boolean;
}

export interface DiffCounts {
  total: number;
  passed: number;
  /** Baselines with value_changed status. */
  changed: number;
  /** Baselines with schema violations (schema_violation status). */
  schemaViolations: number;
  /** Baselines that failed to recompute (infrastructure error). */
  failed: number;
  /** Baselines with command diffs (orthogonal to status). */
  commandsChanged: number;
  /** Baselines where structural comparison was unavailable (hash-only or missing content). */
  diffUnavailable: number;
}

export interface DiffLoopResult {
  counts: DiffCounts;
  baselines: BaselineEntry[];
  /** True if a fatal config/resolution error occurred. */
  fatalError: boolean;
}

/**
 * Shared diff loop used by both `verist diff` and `verist test`.
 */
export async function runDiffLoop(
  opts: DiffOpts,
  globalOpts: GlobalOpts,
): Promise<DiffLoopResult> {
  const cwd = process.cwd();

  // --baseline and --workflow/--version/--step are mutually exclusive
  if (opts.baseline && (opts.workflow || opts.version || opts.step)) {
    console.error(
      "Cannot use --baseline with --step, --workflow, or --version. " +
        "Use --baseline for a specific path, or --step/--workflow/--version for auto-resolution.",
    );
    return { counts: zeroCounts(), baselines: [], fatalError: true };
  }

  let config: VeristConfig;
  try {
    config = await loadConfig(cwd);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return { counts: zeroCounts(), baselines: [], fatalError: true };
  }

  // Resolve step
  if (!opts.step && !opts.baseline) {
    console.error(
      "Provide --step or --baseline to identify which baselines to recompute.",
    );
    return { counts: zeroCounts(), baselines: [], fatalError: true };
  }

  // Resolve baseline paths and step
  let baselinePaths: string[];
  let stepName: string;

  if (opts.baseline) {
    // Explicit baseline path
    const absPath = resolve(cwd, opts.baseline);
    if (!existsSync(absPath)) {
      console.error(`Baseline path not found: ${opts.baseline}`);
      return { counts: zeroCounts(), baselines: [], fatalError: true };
    }

    if (statSync(absPath).isDirectory()) {
      baselinePaths = listBaselines(absPath);
    } else {
      baselinePaths = [absPath];
    }

    if (baselinePaths.length === 0) {
      console.error(`No baseline files found in: ${opts.baseline}`);
      return { counts: zeroCounts(), baselines: [], fatalError: true };
    }

    // Infer step name from first baseline
    let first;
    try {
      first = readBaseline(baselinePaths[0]!);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return { counts: zeroCounts(), baselines: [], fatalError: true };
    }
    stepName = first.snapshot.stepName;
  } else {
    // Auto-resolve from workflow/version/step
    stepName = opts.step!;
    if (!config.steps[stepName]) {
      const available = Object.keys(config.steps).join(", ");
      console.error(
        `Step "${stepName}" not found in config. Available: ${available || "(none)"}`,
      );
      return { counts: zeroCounts(), baselines: [], fatalError: true };
    }

    const workflowId = opts.workflow ?? config.steps[stepName]!.name;
    const workflowVersion = opts.version ?? "0.0.0";
    const dir = baselineDir(cwd, workflowId, workflowVersion, stepName);

    if (!existsSync(dir)) {
      console.error(
        `No baselines found at ${dir}. Run \`verist capture\` first.`,
      );
      return { counts: zeroCounts(), baselines: [], fatalError: true };
    }

    baselinePaths = listBaselines(dir);
    if (baselinePaths.length === 0) {
      console.error(`No baseline files in ${dir}.`);
      return { counts: zeroCounts(), baselines: [], fatalError: true };
    }
  }

  // Step must exist — validated above (auto-resolution) or inferred from baseline
  const step = config.steps[stepName];
  if (!step) {
    const available = Object.keys(config.steps).join(", ");
    const hint = opts.baseline
      ? ` Baseline refers to step "${stepName}" — ensure verist.config defines it.`
      : "";
    console.error(
      `Step "${stepName}" not found in config. Available: ${available || "(none)"}.${hint}`,
    );
    return { counts: zeroCounts(), baselines: [], fatalError: true };
  }

  const contextFactory = createContextFactory(config.adapters);
  const format = opts.format ?? "text";
  const isText = format === "text";
  const metaFilter = parseMetaFilter(opts.meta);

  const counts: DiffCounts = zeroCounts();
  const entries: BaselineEntry[] = [];

  for (const path of baselinePaths) {
    let envelope;
    try {
      envelope = readBaseline(path);
    } catch (error) {
      // Corrupted baselines are always reported — they indicate infra problems
      // regardless of metadata filtering.
      counts.total++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(msg);
      counts.failed++;
      entries.push({
        filename: basename(path),
        status: "failed",
        comparable: false,
        schemaViolations: [],
        deltaDiff: null,
        commandsDiff: null,
        error: msg,
      });
      continue;
    }

    // Filter by label and metadata
    if (opts.label && envelope.metadata.label !== opts.label) {
      continue;
    }
    if (metaFilter && !matchesMeta(envelope.metadata.meta, metaFilter)) {
      continue;
    }
    counts.total++;
    const filename = basename(path);

    const ctx = contextFactory({
      workflowId: envelope.snapshot.workflowId,
      workflowVersion: envelope.snapshot.workflowVersion,
      runId: `recompute:${filename}`,
    });

    const result: Result<
      RecomputeResult<unknown>,
      RecomputeError
    > = await recompute(envelope.snapshot, step, ctx, { validate: true });

    if (!result.ok) {
      console.error(formatError(result.error, globalOpts.debug));
      counts.failed++;
      entries.push({
        filename,
        status: "failed",
        comparable: false,
        schemaViolations: [],
        deltaDiff: null,
        commandsDiff: null,
        error: result.error.message,
      });
      continue;
    }

    // Dominance semantics: each run counts in exactly one bucket
    const { status, commandsDiff, deltaDiff, schemaViolations, comparable } =
      result.value;
    switch (status) {
      case "schema_violation":
        counts.schemaViolations++;
        break;
      case "value_changed":
        counts.changed++;
        break;
      case "clean":
        counts.passed++;
        break;
    }

    // Track diffUnavailable baselines (hash-only or missing content)
    if (!comparable) {
      counts.diffUnavailable++;
    }

    // Commands are orthogonal — tracked separately.
    // Skip command diffs when baseline was captured with --no-commands to avoid false positives.
    const ignoreCommands = envelope.metadata.commandsCaptured === false;
    if (commandsDiff && !commandsDiff.equal && !ignoreCommands) {
      counts.commandsChanged++;
    }

    entries.push({
      filename,
      status,
      comparable,
      schemaViolations,
      deltaDiff: deltaDiff ?? null,
      commandsDiff: ignoreCommands ? null : (commandsDiff ?? null),
    });

    if (isText && !globalOpts.quiet) {
      console.log(formatBaselineResult(filename, result.value));
    }
  }

  if (counts.total === 0 && (metaFilter || opts.label)) {
    const filters = [
      opts.label ? `--label "${opts.label}"` : null,
      metaFilter ? "--meta" : null,
    ].filter(Boolean);
    console.error(`No baselines matched the ${filters.join(" and ")} filter.`);
    return { counts: zeroCounts(), baselines: [], fatalError: true };
  }

  // Machine formats (json/markdown) always emit — they are structured output for CI piping.
  // --quiet only suppresses human-readable text output.
  if (isText) {
    if (!globalOpts.quiet) {
      console.log(`\n${formatSummary(counts)}`);
    }
  } else if (format === "json") {
    console.log(formatJson(stepName, counts, entries));
  } else {
    console.log(formatMarkdown(stepName, counts, entries));
  }

  return { counts, baselines: entries, fatalError: false };
}

function zeroCounts(): DiffCounts {
  return {
    total: 0,
    passed: 0,
    changed: 0,
    schemaViolations: 0,
    failed: 0,
    commandsChanged: 0,
    diffUnavailable: 0,
  };
}

/** Parse repeatable `--meta key=value` into a filter record. */
function parseMetaFilter(
  raw: string[] | undefined,
): Record<string, string> | undefined {
  if (!raw || raw.length === 0) return undefined;
  const result: Record<string, string> = {};
  for (const entry of raw) {
    const eq = entry.indexOf("=");
    if (eq === -1) {
      result[entry] = "";
    } else {
      result[entry.slice(0, eq)] = entry.slice(eq + 1);
    }
  }
  return result;
}

/** Check if baseline metadata matches all filter entries. */
function matchesMeta(
  meta: Record<string, string> | undefined,
  filter: Record<string, string>,
): boolean {
  if (!meta) return false;
  for (const [key, value] of Object.entries(filter)) {
    if (meta[key] !== value) return false;
  }
  return true;
}
