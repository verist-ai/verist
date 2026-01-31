import type { Result, Step, StepContext, StepOutput } from "@verist/core";
import { err, ok } from "@verist/core";
import { captureArtifact } from "./artifact.ts";
import { diff } from "./diff.ts";
import { hashValue } from "./hash.ts";
import type {
  CaptureOptions,
  DiffResult,
  RecomputeResult,
  Snapshot,
} from "./types.ts";

/** Check if value has step-output shape (object with delta key). */
function isStepOutputShape(value: unknown): value is { delta: unknown } {
  return value !== null && typeof value === "object" && "delta" in value;
}

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
  /** Capture artifacts for the recomputed output. Pass options or true. */
  captureArtifacts?: CaptureOptions | boolean;
}

/**
 * Recompute a step with fresh execution and compare to original.
 *
 * Unlike replay (which uses stored artifacts), recompute makes fresh calls
 * to adapters (LLMs, databases, etc). This reveals what would change if
 * the step were run today with current models/data.
 *
 * **Note:** The diff compares delta only (state changes), not events.
 * Events are audit logs, not the "decision" being reviewed.
 *
 * @example
 * ```typescript
 * const result = await recompute(snapshot, extractStep, ctx);
 * if (result.ok) {
 *   if (result.value.diff === undefined) {
 *     console.log("Original unavailable for comparison");
 *   } else if (!result.value.diff.equal) {
 *     console.log("Delta changed:", formatDiff(result.value.diff));
 *   }
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

  // Find original output for comparison.
  // Validate shape to avoid comparing corrupted/migrated data as if valid.
  const originalOutputArtifact = snapshot.artifacts.find(
    (a) => a.kind === "step-output",
  );
  const originalOutput = isStepOutputShape(originalOutputArtifact?.content)
    ? (originalOutputArtifact.content as StepOutput<TState>)
    : undefined;

  // Diff only the delta (state change), not events.
  // Events are audit logs, not the "decision" being reviewed.
  // Returns undefined if original is unavailable (hash-only or malformed).
  const outputDiff =
    originalOutput !== undefined
      ? diff(originalOutput.delta, newOutput.delta)
      : undefined;

  // Resolve capture options: true → full content, false/undefined → skip, object → pass through
  const captureArtifacts = options?.captureArtifacts;
  const shouldCapture =
    captureArtifacts !== undefined && captureArtifacts !== false;
  const captureOpts =
    captureArtifacts === true ? undefined : captureArtifacts || undefined;

  return ok({
    output: newOutput,
    diff: outputDiff,
    outputArtifact: shouldCapture
      ? captureArtifact("step-output", newOutput, captureOpts)
      : undefined,
  });
}

/**
 * Compare two snapshots to see what changed.
 * Useful for comparing outputs across workflow versions.
 *
 * **Note:** Compares delta only (state changes), not events.
 * This matches `recompute()` semantics — events are audit logs,
 * not the decision being reviewed.
 *
 * `deltaDiff` will be `undefined` if either snapshot:
 * - Is hash-only (content not stored)
 * - Has malformed step-output (missing `delta` key)
 */
export function compareSnapshots(
  original: Snapshot,
  updated: Snapshot,
): { inputDiff: DiffResult; deltaDiff: DiffResult | undefined } {
  const inputDiff = diff(original.input, updated.input);

  const originalArtifact = original.artifacts.find(
    (a) => a.kind === "step-output",
  );
  const updatedArtifact = updated.artifacts.find(
    (a) => a.kind === "step-output",
  );

  // Require content with valid step-output shape for comparison.
  // Hash-only or malformed artifacts cannot be compared.
  const originalValid = isStepOutputShape(originalArtifact?.content);
  const updatedValid = isStepOutputShape(updatedArtifact?.content);

  if (
    !originalValid ||
    !updatedValid ||
    !originalArtifact ||
    !updatedArtifact
  ) {
    return { inputDiff, deltaDiff: undefined };
  }

  const deltaDiff = diff(
    (originalArtifact.content as { delta: unknown }).delta,
    (updatedArtifact.content as { delta: unknown }).delta,
  );

  return { inputDiff, deltaDiff };
}
