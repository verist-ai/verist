// SPDX-License-Identifier: Apache-2.0

import { hashValue } from "./artifact.ts";
import type { Result } from "./result.ts";
import { err, ok } from "./result.ts";
import type { Snapshot } from "./types.ts";

/**
 * Error codes for loadOutput.
 */
export type LoadOutputErrorCode = "missing_output" | "output_corrupted";

/**
 * Error from loadOutput.
 */
export interface LoadOutputError {
  code: LoadOutputErrorCode;
  message: string;
}

/**
 * Load the stored step output from a snapshot.
 *
 * This retrieves the captured output without re-executing the step.
 * Use this for reading historical results or comparing outputs.
 *
 * **Note:** Hash-only snapshots (captured with `{ hashOnly: true }`) cannot
 * be loaded — the content was intentionally not stored. Use hash-only mode
 * when you need audit trails without persisting sensitive data.
 *
 * @example
 * ```typescript
 * const result = await loadOutput<ExtractOutput>(snapshot);
 * if (result.ok) {
 *   console.log(result.value);
 * }
 * ```
 */
export async function loadOutput<T>(
  snapshot: Snapshot,
): Promise<Result<T, LoadOutputError>> {
  const outputArtifact = snapshot.artifacts.find(
    (a) => a.kind === "step-output",
  );

  if (!outputArtifact) {
    return err({
      code: "missing_output",
      message: `No step-output artifact in snapshot for step "${snapshot.stepName}"`,
    });
  }

  if (outputArtifact.content === undefined) {
    return err({
      code: "missing_output",
      message: `Step output content not available (hash-only capture) for step "${snapshot.stepName}"`,
    });
  }

  // Verify content integrity
  let actualHash: string;
  try {
    actualHash = await hashValue(outputArtifact.content);
  } catch {
    return err({
      code: "output_corrupted",
      message: `Cannot verify output integrity for step "${snapshot.stepName}": content is not serializable`,
    });
  }

  if (actualHash !== outputArtifact.hash) {
    return err({
      code: "output_corrupted",
      message: `Output hash mismatch for step "${snapshot.stepName}": expected ${outputArtifact.hash}, got ${actualHash}`,
    });
  }

  return ok(outputArtifact.content as T);
}
