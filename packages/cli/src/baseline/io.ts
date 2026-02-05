// SPDX-License-Identifier: Apache-2.0

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Snapshot } from "verist";

const FORMAT_VERSION = "verist-baseline@1";

/**
 * Metadata stored alongside the snapshot in a baseline envelope.
 */
export interface BaselineMetadata {
  /** Original input file path (relative or absolute). */
  inputPath: string;
  /** Optional human-readable label. */
  label?: string;
  /** Whether commands were captured in the snapshot. */
  commandsCaptured: boolean;
  /** User-defined key-value metadata for filtering. */
  meta?: Record<string, string>;
}

/**
 * Persisted baseline format. Contains a snapshot and metadata.
 */
export interface BaselineEnvelope {
  format: typeof FORMAT_VERSION;
  snapshot: Snapshot;
  metadata: BaselineMetadata;
}

/** Validate baseline artifact invariants. Shared by read and write. */
function validateArtifacts(
  artifacts: Snapshot["artifacts"],
  context: string,
): void {
  const outputCount = artifacts.filter((a) => a.kind === "step-output").length;
  if (outputCount !== 1) {
    throw new Error(
      `${context} must contain exactly one step-output artifact, got ${outputCount}`,
    );
  }

  const commandsCount = artifacts.filter(
    (a) => a.kind === "step-commands",
  ).length;
  if (commandsCount > 1) {
    throw new Error(
      `${context} must contain at most one step-commands artifact, got ${commandsCount}`,
    );
  }
}

/**
 * Write a baseline envelope to disk.
 * Asserts exactly one step-output artifact exists.
 *
 * @returns Absolute path to the written file.
 */
export function writeBaseline(
  dir: string,
  filename: string,
  envelope: BaselineEnvelope,
): string {
  validateArtifacts(envelope.snapshot.artifacts, "Baseline snapshot");

  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, filename);
  writeFileSync(filePath, JSON.stringify(envelope, null, 2) + "\n");
  return filePath;
}

/**
 * Read and validate a baseline envelope from disk.
 */
export function readBaseline(path: string): BaselineEnvelope {
  if (!existsSync(path)) {
    throw new Error(`Baseline file not found: ${path}`);
  }

  const raw = readFileSync(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in baseline file: ${path}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Baseline file does not contain an object: ${path}`);
  }

  const envelope = parsed as Record<string, unknown>;
  if (envelope.format !== FORMAT_VERSION) {
    throw new Error(
      `Unsupported baseline format "${envelope.format ?? "(missing)"}". Expected "${FORMAT_VERSION}".`,
    );
  }

  // Structural guards — baseline files are user-editable, don't trust the shape
  const snapshot = envelope.snapshot;
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error(`Baseline file missing "snapshot" field: ${path}`);
  }
  const s = snapshot as Record<string, unknown>;
  if (typeof s.stepName !== "string") {
    throw new Error(`Baseline snapshot missing "stepName": ${path}`);
  }
  if (typeof s.inputHash !== "string") {
    throw new Error(`Baseline snapshot missing "inputHash": ${path}`);
  }
  if (!Array.isArray(s.artifacts)) {
    throw new Error(`Baseline file has invalid "snapshot.artifacts": ${path}`);
  }

  const result = envelope as unknown as BaselineEnvelope;
  validateArtifacts(result.snapshot.artifacts, `Baseline file ${path}`);
  return result;
}

/**
 * List baseline JSON files in a directory, sorted alphabetically.
 */
export function listBaselines(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(dir, f));
}
