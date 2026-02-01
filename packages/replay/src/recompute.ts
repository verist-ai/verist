// SPDX-License-Identifier: Apache-2.0

import type {
  Command,
  Result,
  Step,
  StepContext,
  StepOutput,
} from "@verist/core";
import { err, ok } from "@verist/core";
import { captureArtifact, normalizeCommands } from "./artifact.ts";
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
 * Compares both delta (state changes) and commands (control-flow decisions).
 * Events are audit logs and are not diffed.
 *
 * @example
 * ```typescript
 * const result = await recompute(snapshot, extractStep, ctx);
 * if (result.ok) {
 *   const { deltaDiff, commandsDiff } = result.value;
 *   if (deltaDiff && !deltaDiff.equal) {
 *     console.log("State changed:", formatDiff(deltaDiff));
 *   }
 *   if (commandsDiff && !commandsDiff.equal) {
 *     console.log("Control flow changed:", formatDiff(commandsDiff));
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
  const currentInputHash = await hashValue(snapshot.input);
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

  // Find original output for delta comparison.
  // Validate shape to avoid comparing corrupted/migrated data as if valid.
  const originalOutputArtifact = snapshot.artifacts.find(
    (a) => a.kind === "step-output",
  );
  const originalOutput = isStepOutputShape(originalOutputArtifact?.content)
    ? (originalOutputArtifact.content as StepOutput<TState>)
    : undefined;

  // Diff delta (state changes). Returns undefined if original is unavailable.
  const deltaDiff =
    originalOutput !== undefined
      ? diff(originalOutput.delta, newOutput.delta)
      : undefined;

  // Diff commands (control-flow decisions).
  // First try step-commands artifact, then fall back to commands in step-output.
  const originalCommandsArtifact = snapshot.artifacts.find(
    (a) => a.kind === "step-commands",
  );
  const originalCommands: Command[] | undefined =
    originalCommandsArtifact?.content !== undefined
      ? (originalCommandsArtifact.content as Command[])
      : originalOutput?.commands;

  // Normalize both for comparison (commands are semantically a set)
  const commandsDiff =
    originalCommands !== undefined
      ? diff(
          normalizeCommands(originalCommands),
          normalizeCommands(newOutput.commands),
        )
      : undefined;

  // Resolve capture options: true → full content, false/undefined → skip, object → pass through
  const captureArtifacts = options?.captureArtifacts;
  const shouldCapture =
    captureArtifacts !== undefined && captureArtifacts !== false;
  const captureOpts =
    captureArtifacts === true ? undefined : captureArtifacts || undefined;

  return ok({
    output: newOutput,
    deltaDiff,
    commandsDiff,
    outputArtifact: shouldCapture
      ? await captureArtifact("step-output", newOutput, captureOpts)
      : undefined,
  });
}

/**
 * Compare two snapshots to see what changed.
 * Useful for comparing outputs across workflow versions.
 *
 * Compares delta (state changes) and commands (control-flow decisions).
 * Events are audit logs and are not compared.
 *
 * `deltaDiff` will be `undefined` if either snapshot:
 * - Is hash-only (content not stored)
 * - Has malformed step-output (missing `delta` key)
 *
 * `commandsDiff` will be `undefined` if commands are unavailable in either snapshot.
 */
export function compareSnapshots(
  original: Snapshot,
  updated: Snapshot,
): {
  inputDiff: DiffResult;
  deltaDiff: DiffResult | undefined;
  commandsDiff: DiffResult | undefined;
} {
  const inputDiff = diff(original.input, updated.input);

  const originalOutputArtifact = original.artifacts.find(
    (a) => a.kind === "step-output",
  );
  const updatedOutputArtifact = updated.artifacts.find(
    (a) => a.kind === "step-output",
  );

  // Require content with valid step-output shape for delta comparison.
  const originalValid = isStepOutputShape(originalOutputArtifact?.content);
  const updatedValid = isStepOutputShape(updatedOutputArtifact?.content);

  const deltaDiff =
    originalValid &&
    updatedValid &&
    originalOutputArtifact &&
    updatedOutputArtifact
      ? diff(
          (originalOutputArtifact.content as { delta: unknown }).delta,
          (updatedOutputArtifact.content as { delta: unknown }).delta,
        )
      : undefined;

  // Extract commands for comparison.
  // First try step-commands artifact, then fall back to commands in step-output.
  const originalCommandsArtifact = original.artifacts.find(
    (a) => a.kind === "step-commands",
  );
  const updatedCommandsArtifact = updated.artifacts.find(
    (a) => a.kind === "step-commands",
  );

  const originalCommands: Command[] | undefined =
    originalCommandsArtifact?.content !== undefined
      ? (originalCommandsArtifact.content as Command[])
      : originalValid
        ? (originalOutputArtifact?.content as { commands?: Command[] })
            ?.commands
        : undefined;

  const updatedCommands: Command[] | undefined =
    updatedCommandsArtifact?.content !== undefined
      ? (updatedCommandsArtifact.content as Command[])
      : updatedValid
        ? (updatedOutputArtifact?.content as { commands?: Command[] })?.commands
        : undefined;

  const commandsDiff =
    originalCommands !== undefined && updatedCommands !== undefined
      ? diff(
          normalizeCommands(originalCommands),
          normalizeCommands(updatedCommands),
        )
      : undefined;

  return { inputDiff, deltaDiff, commandsDiff };
}
