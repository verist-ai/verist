// SPDX-License-Identifier: Apache-2.0

import { hashValue } from "@verist/replay";
import { existsSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { BaselineEnvelope } from "../baseline/index.ts";
import { baselineDir, listBaselines, readBaseline } from "../baseline/index.ts";
import { EXIT_ERROR } from "../exitCodes.ts";
import { formatReplayEntry, formatReplaySummary } from "../ui/index.ts";

interface ReplayOpts {
  step?: string;
  label?: string;
  baseline?: string;
  workflow?: string;
  version?: string;
  verify?: boolean;
  meta?: string[];
}

interface GlobalOpts {
  debug?: boolean;
  quiet?: boolean;
}

/**
 * `verist replay` — inspect baselines and optionally verify hash integrity.
 */
export async function replayCommand(
  opts: ReplayOpts,
  globalOpts: GlobalOpts,
): Promise<void> {
  const cwd = process.cwd();

  // Resolve baseline paths
  let baselinePaths: string[];

  if (opts.baseline) {
    // --baseline is mutually exclusive with --step/--workflow/--version
    if (opts.step || opts.workflow || opts.version) {
      console.error(
        "Cannot use --baseline with --step, --workflow, or --version.",
      );
      process.exitCode = EXIT_ERROR;
      return;
    }

    const absPath = resolve(cwd, opts.baseline);
    if (!existsSync(absPath)) {
      console.error(`Baseline path not found: ${opts.baseline}`);
      process.exitCode = EXIT_ERROR;
      return;
    }

    if (statSync(absPath).isDirectory()) {
      baselinePaths = listBaselines(absPath);
    } else {
      baselinePaths = [absPath];
    }
  } else if (opts.step) {
    // Auto-resolve from step/workflow/version
    const workflowId = opts.workflow ?? opts.step;
    const workflowVersion = opts.version ?? "0.0.0";
    const dir = baselineDir(cwd, workflowId, workflowVersion, opts.step);

    if (!existsSync(dir)) {
      console.error(
        `No baselines found at ${dir}. Run \`verist capture\` first.`,
      );
      process.exitCode = EXIT_ERROR;
      return;
    }

    baselinePaths = listBaselines(dir);
  } else {
    console.error(
      "Provide --step or --baseline to identify which baselines to inspect.",
    );
    process.exitCode = EXIT_ERROR;
    return;
  }

  if (baselinePaths.length === 0) {
    console.error("No baseline files found.");
    process.exitCode = EXIT_ERROR;
    return;
  }

  // Parse --meta filter
  const metaFilter = parseMetaFilter(opts.meta);

  // Filter by label and metadata
  let envelopes: Array<{ path: string; envelope: BaselineEnvelope }> = [];
  let readErrors = 0;
  for (const path of baselinePaths) {
    try {
      const envelope = readBaseline(path);
      if (opts.label && envelope.metadata.label !== opts.label) {
        continue;
      }
      if (metaFilter && !matchesMeta(envelope.metadata.meta, metaFilter)) {
        continue;
      }
      envelopes.push({ path, envelope });
    } catch (error) {
      readErrors++;
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  if (envelopes.length === 0) {
    const filters = [
      opts.label ? `label "${opts.label}"` : null,
      metaFilter ? `meta filter` : null,
    ].filter(Boolean);
    console.error(
      filters.length > 0
        ? `No baselines found matching ${filters.join(" and ")}.`
        : "No baseline files found.",
    );
    process.exitCode = EXIT_ERROR;
    return;
  }

  let verifiedCount = 0;
  let mismatchCount = 0;
  let skippedCount = 0;

  for (const { path, envelope } of envelopes) {
    const filename = basename(path);

    let verification:
      | {
          valid: boolean;
          mismatches: Array<{ kind: string; expected: string; actual: string }>;
          checked: number;
          skipped: number;
        }
      | undefined;

    if (opts.verify) {
      const mismatches: Array<{
        kind: string;
        expected: string;
        actual: string;
      }> = [];
      let checked = 0;
      let skipped = 0;

      // Verify inputHash against input
      if (envelope.snapshot.input !== undefined) {
        checked++;
        const actual = await hashValue(envelope.snapshot.input);
        if (actual !== envelope.snapshot.inputHash) {
          mismatches.push({
            kind: "input",
            expected: envelope.snapshot.inputHash,
            actual,
          });
        }
      } else {
        skipped++;
      }

      // Verify artifact hashes
      for (const artifact of envelope.snapshot.artifacts) {
        if (artifact.content === undefined) {
          skipped++;
          continue;
        }
        checked++;
        const actual = await hashValue(artifact.content);
        if (actual !== artifact.hash) {
          mismatches.push({
            kind: artifact.kind,
            expected: artifact.hash,
            actual,
          });
        }
      }

      verification = {
        valid: mismatches.length === 0,
        mismatches,
        checked,
        skipped,
      };

      if (verification.checked === 0) {
        skippedCount++;
      } else if (verification.valid) {
        verifiedCount++;
      } else {
        mismatchCount++;
      }
    }

    console.log(formatReplayEntry(filename, envelope, verification));
    console.log();
  }

  if (!globalOpts.quiet) {
    console.log(
      formatReplaySummary(
        envelopes.length,
        opts.verify ? verifiedCount : undefined,
        opts.verify ? mismatchCount : undefined,
        opts.verify ? skippedCount : undefined,
      ),
    );
  }

  if (readErrors > 0) {
    process.exitCode = EXIT_ERROR;
  }
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
