// SPDX-License-Identifier: Apache-2.0

import { globSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Artifact } from "verist";
import { createSnapshotFromResult, run } from "verist";
import { RESERVED_ARTIFACT_KINDS } from "verist/internals";
import type { BaselineEnvelope } from "../baseline/index.ts";
import {
  baselineDir,
  baselineFilename,
  writeBaseline,
} from "../baseline/index.ts";
import { loadConfig } from "../config.ts";
import { EXIT_ERROR } from "../exitCodes.ts";
import { formatSummary } from "../ui/index.ts";
import { sample } from "../utils/sample.ts";

interface CaptureOpts {
  step: string;
  input: string;
  workflow?: string;
  version?: string;
  label?: string;
  commands: boolean;
  sample?: string;
  seed?: string;
  meta?: string[];
}

interface GlobalOpts {
  debug?: boolean;
  quiet?: boolean;
}

export async function capture(
  opts: CaptureOpts,
  globalOpts: GlobalOpts,
): Promise<void> {
  const cwd = process.cwd();

  let config;
  try {
    config = await loadConfig(cwd);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = EXIT_ERROR;
    return;
  }

  const step = config.steps[opts.step];
  if (!step) {
    const available = Object.keys(config.steps).join(", ");
    console.error(
      `Step "${opts.step}" not found in config. Available steps: ${available || "(none)"}`,
    );
    process.exitCode = EXIT_ERROR;
    return;
  }

  const workflowId = opts.workflow ?? step.name;
  const workflowVersion = opts.version ?? "0.0.0";

  // Glob input files (node:fs globSync works on Node 22+ and Bun)
  let inputFiles = globSync(opts.input, { cwd })
    .map((f) => join(cwd, f))
    .sort();

  if (inputFiles.length === 0) {
    console.error(`No files matched pattern: ${opts.input}`);
    process.exitCode = EXIT_ERROR;
    return;
  }

  // Apply sampling after glob
  if (opts.sample) {
    const count = parseInt(opts.sample, 10);
    if (isNaN(count) || count <= 0) {
      console.error(`Invalid --sample value: ${opts.sample}`);
      process.exitCode = EXIT_ERROR;
      return;
    }
    const seed = opts.seed ? parseInt(opts.seed, 10) : 0;
    if (opts.seed && isNaN(seed)) {
      console.error(`Invalid --seed value: ${opts.seed}`);
      process.exitCode = EXIT_ERROR;
      return;
    }
    inputFiles = sample(inputFiles, count, seed);
  }

  // Parse --meta key=value pairs
  const meta = parseMeta(opts.meta);

  const dir = baselineDir(cwd, workflowId, workflowVersion, step.name);

  const counts = { captured: 0, failed: 0 };

  for (const filePath of inputFiles) {
    const relativePath = relative(cwd, filePath);

    let input: unknown;
    try {
      input = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch (error) {
      console.error(
        `Invalid JSON: ${relativePath} — ${error instanceof Error ? error.message : String(error)}`,
      );
      counts.failed++;
      continue;
    }

    // Collect artifacts emitted by adapters during execution
    const capturedArtifacts: Artifact[] = [];
    const onArtifact = (artifact: Artifact) => {
      // Filter out reserved kinds — they're added by createSnapshotFromResult
      if (!RESERVED_ARTIFACT_KINDS.has(artifact.kind)) {
        capturedArtifacts.push(artifact);
      }
    };

    const result = await run(step, input, {
      adapters: config.adapters,
      workflowId,
      workflowVersion,
      onArtifact,
    });

    if (!result.ok) {
      console.error(
        `Step failed for ${relativePath}: [${result.error.code}] ${result.error.message}`,
      );
      counts.failed++;
      continue;
    }

    const snapshot = await createSnapshotFromResult(result.value, {
      captureCommands: opts.commands,
      artifacts: capturedArtifacts,
    });

    const filename = baselineFilename(relativePath, snapshot.inputHash);
    const envelope: BaselineEnvelope = {
      format: "verist-baseline@1",
      snapshot,
      metadata: {
        inputPath: relativePath,
        label: opts.label,
        commandsCaptured: opts.commands,
        ...(meta && { meta }),
      },
    };

    const writtenPath = writeBaseline(dir, filename, envelope);
    if (!globalOpts.quiet) {
      console.log(`✓ ${relativePath} → ${relative(cwd, writtenPath)}`);
    }
    counts.captured++;
  }

  if (!globalOpts.quiet) {
    console.log(
      `\n${formatSummary({ total: inputFiles.length, passed: counts.captured, changed: 0, schemaViolations: 0, failed: counts.failed, commandsChanged: 0, diffUnavailable: 0 })}`,
    );
  }

  // Best-effort: partial failures don't fail the run, only total failure does
  if (counts.failed > 0 && counts.captured === 0) {
    process.exitCode = EXIT_ERROR;
  }
}

/** Parse repeatable `--meta key=value` into a record. Returns undefined if empty. */
function parseMeta(
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
