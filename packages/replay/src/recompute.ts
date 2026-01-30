import type { Step, StepContext, StepOutput, Result } from "@verist/core";
import { ok, err } from "@verist/core";
import type { Snapshot, RecomputeResult, DiffResult } from "./types.ts";
import { diff } from "./diff.ts";
import { hashValue } from "./hash.ts";
import { captureArtifact } from "./artifact.ts";

/**
 * Recompute error types.
 */
export type RecomputeErrorCode = "INPUT_HASH_MISMATCH" | "EXECUTION_FAILED";

export interface RecomputeError {
  code: RecomputeErrorCode;
  message: string;
  cause?: unknown;
}

/**
 * Options for recomputation.
 */
export interface RecomputeOptions {
  /** If true, capture new artifacts during recomputation */
  captureArtifacts?: boolean;
}

/**
 * Recompute a step with fresh execution and compare to original.
 *
 * Unlike replay (which uses stored artifacts), recompute makes fresh calls
 * to adapters (LLMs, databases, etc). This reveals what would change if
 * the step were run today with current models/data.
 *
 * Returns Result per Invariant #9 (Errors are Values).
 *
 * @example
 * ```typescript
 * const result = await recompute(snapshot, extractStep, ctx);
 * if (result.ok && !result.value.diff.equal) {
 *   console.log("Output changed:", formatDiff(result.value.diff));
 * }
 * ```
 */
export async function recompute<TInput, TState>(
  snapshot: Snapshot,
  step: Step<TInput, TState>,
  ctx: StepContext,
  options?: RecomputeOptions,
): Promise<Result<RecomputeResult<StepOutput<TState>>, RecomputeError>> {
  // Verify input hash matches
  const currentInputHash = hashValue(snapshot.input);
  if (currentInputHash !== snapshot.inputHash) {
    return err({
      code: "INPUT_HASH_MISMATCH",
      message: `Input hash mismatch: expected ${snapshot.inputHash}, got ${currentInputHash}`,
    });
  }

  // Execute the step with fresh adapters
  let newOutput: StepOutput<TState>;
  try {
    newOutput = await step.run(snapshot.input as TInput, ctx);
  } catch (cause) {
    return err({
      code: "EXECUTION_FAILED",
      message: cause instanceof Error ? cause.message : String(cause),
      cause,
    });
  }

  // Find original output for comparison
  const originalOutputArtifact = snapshot.artifacts.find(
    (a) => a.kind === "step-output",
  );
  const originalOutput = originalOutputArtifact?.content as
    | StepOutput<TState>
    | undefined;

  // Compute diff between original and new output
  let outputDiff: DiffResult;
  if (originalOutput !== undefined) {
    outputDiff = diff(originalOutput, newOutput);
  } else {
    // No original to compare, treat as all new
    outputDiff = {
      equal: false,
      entries: [{ path: [], before: undefined, after: newOutput }],
    };
  }

  return ok({
    output: newOutput,
    diff: outputDiff,
    artifact: options?.captureArtifacts
      ? captureArtifact("step-output", newOutput)
      : undefined,
  });
}

/**
 * Compare two snapshots to see what changed.
 * Useful for comparing outputs across workflow versions.
 */
export function compareSnapshots(
  original: Snapshot,
  updated: Snapshot,
): { inputDiff: DiffResult; outputDiff: DiffResult } {
  const inputDiff = diff(original.input, updated.input);

  const originalOutput = original.artifacts.find(
    (a) => a.kind === "step-output",
  )?.content;
  const updatedOutput = updated.artifacts.find(
    (a) => a.kind === "step-output",
  )?.content;

  const outputDiff = diff(originalOutput, updatedOutput);

  return { inputDiff, outputDiff };
}
