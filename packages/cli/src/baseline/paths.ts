// SPDX-License-Identifier: Apache-2.0

import { join } from "node:path";

/**
 * Resolve the baseline directory for a given workflow/version/step.
 */
export function baselineDir(
  cwd: string,
  workflowId: string,
  workflowVersion: string,
  stepName: string,
): string {
  return join(
    cwd,
    ".verist",
    "baselines",
    workflowId,
    workflowVersion,
    stepName,
  );
}

/**
 * Generate a deterministic baseline filename from an input file path and its hash.
 *
 * Format: `<normalized-name>-<shortHash>.json`
 * where shortHash is the first 8 hex chars of the input hash
 * (from `snapshot.inputHash`, computed by `verist`).
 *
 * Uses the snapshot's own hash — CLI doesn't compute hashes independently.
 */
export function baselineFilename(inputPath: string, inputHash: string): string {
  const name = normalizeName(fileBaseName(inputPath));
  // hash format: "sha256:<hex>", take first 8 chars of hex
  const shortHash = inputHash.slice("sha256:".length, "sha256:".length + 8);
  return `${name}-${shortHash}.json`;
}

/**
 * Normalize a name for use in file paths.
 *
 * - Unicode NFKD decomposition, strip combining marks (diacritics)
 * - Lowercase
 * - Non-alphanumeric → hyphens, collapse consecutive, trim edges
 * - Cap at 64 chars
 * - Fallback to "input" if empty
 */
export function normalizeName(name: string): string {
  let result = name
    // NFKD: decompose accented chars into base + combining mark
    .normalize("NFKD")
    // Strip combining diacritical marks (U+0300–U+036F)
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Non-alphanumeric → hyphen
    .replace(/[^a-z0-9]+/g, "-")
    // Collapse consecutive hyphens
    .replace(/-{2,}/g, "-")
    // Trim leading/trailing hyphens
    .replace(/^-|-$/g, "");

  // Cap length
  if (result.length > 64) {
    result = result.slice(0, 64).replace(/-$/, "");
  }

  return result || "input";
}

/** Extract base name without extension from a file path. */
function fileBaseName(filePath: string): string {
  const segments = filePath.split(/[/\\]/);
  const filename = segments[segments.length - 1] ?? "";
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
}
