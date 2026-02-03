// SPDX-License-Identifier: Apache-2.0

import { run } from "@verist/core";
import type { Artifact } from "@verist/replay";
import {
  createSnapshotFromResult,
  RESERVED_ARTIFACT_KINDS,
} from "@verist/replay";
import { globSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { BaselineEnvelope } from "../baseline/index.ts";
import {
  baselineDir,
  baselineFilename,
  writeBaseline,
} from "../baseline/index.ts";
import { loadConfig } from "../config.ts";
import { EXIT_ERROR } from "../exitCodes.ts";
import { formatSummary } from "../ui/index.ts";

interface CaptureOpts {
  step: string;
  input: string;
  workflow?: string;
  version?: string;
  label?: string;
  commands: boolean;
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
  const inputFiles = globSync(opts.input, { cwd })
    .map((f) => join(cwd, f))
    .sort();

  if (inputFiles.length === 0) {
    console.error(`No files matched pattern: ${opts.input}`);
    process.exitCode = EXIT_ERROR;
    return;
  }

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
      `\n${formatSummary({ total: inputFiles.length, passed: counts.captured, changed: 0, failed: counts.failed })}`,
    );
  }

  // Best-effort: partial failures don't fail the run, only total failure does
  if (counts.failed > 0 && counts.captured === 0) {
    process.exitCode = EXIT_ERROR;
  }
}
