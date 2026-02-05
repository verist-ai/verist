// SPDX-License-Identifier: Apache-2.0

import type { OnArtifact } from "./artifact.ts";
import { hashValue } from "./artifact.ts";
import type { Command } from "./command.ts";
import { createContextFactory } from "./context.ts";
import { diff, formatPath } from "./diff.ts";
import type { Result } from "./result.ts";
import { err, ok } from "./result.ts";
import { captureArtifact, normalizeCommands } from "./snapshot.ts";
import type { Step, StepOutput } from "./step.ts";
import type {
  AdaptersOption,
  BaseAdapters,
  CaptureOptions,
  Delta,
  DiffResult,
  OptionsArg,
  RecomputeResult,
  RecomputeStatus,
  SchemaViolation,
  Snapshot,
} from "./types.ts";

/** Check if value has step-output shape (object with delta key). */
function isStepOutputShape(value: unknown): value is { delta: unknown } {
  return value !== null && typeof value === "object" && "delta" in value;
}

/** Extract commands from a snapshot. Prefers step-commands artifact, falls back to step-output. */
function extractSnapshotCommands(snapshot: Snapshot): Command[] | undefined {
  const commandsArtifact = snapshot.artifacts.find(
    (a) => a.kind === "step-commands",
  );
  if (
    commandsArtifact?.content !== undefined &&
    isCommandArray(commandsArtifact.content)
  ) {
    return commandsArtifact.content as Command[];
  }
  const outputArtifact = snapshot.artifacts.find(
    (a) => a.kind === "step-output",
  );
  if (isStepOutputShape(outputArtifact?.content)) {
    const commands = (outputArtifact.content as { commands?: unknown })
      .commands;
    return isCommandArray(commands) ? (commands as Command[]) : undefined;
  }
  return undefined;
}

/** Cheap shape check: array of objects with a string `type` field. */
function isCommandArray(value: unknown): value is Command[] {
  return (
    Array.isArray(value) &&
    value.every(
      (c) =>
        c !== null &&
        typeof c === "object" &&
        "type" in c &&
        typeof (c as Record<string, unknown>).type === "string",
    )
  );
}

/**
 * Recompute error types.
 */
export type RecomputeErrorCode =
  | "INPUT_HASH_MISMATCH"
  | "INPUT_VALIDATION"
  | "EXECUTION_FAILED";

export interface RecomputeError {
  code: RecomputeErrorCode;
  message: string;
  cause?: unknown;
}

/**
 * Options for recomputation.
 * `adapters` is required when the step declares adapters, optional otherwise.
 */
export type RecomputeOptions<TAdapters extends BaseAdapters = BaseAdapters> =
  RecomputeOptionsBase & AdaptersOption<TAdapters>;

interface RecomputeOptionsBase {
  /** Override runId. Defaults to random UUID. */
  runId?: string;
  /** Callback for capturing artifacts during execution. */
  onArtifact?: OnArtifact;
  /** Capture artifacts for the recomputed output. Pass options or true. */
  captureArtifacts?: CaptureOptions | boolean;
  /**
   * Enable schema validation:
   * - Input: strict (returns `err(INPUT_VALIDATION)` on failure)
   * - Output delta: observational (populates `schemaViolations`, never gates).
   *   When output passes, the Zod-parsed delta is used for diff and returned
   *   as `parsedDelta` (reflecting defaults, coercions, transforms).
   */
  validate?: boolean;
  /**
   * Validate output against the full delta schema instead of the partial
   * schema. Catches missing required fields that `.partial()` would allow.
   * Only effective when `validate` is also true.
   */
  strictOutput?: boolean;
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
 * const result = await recompute(snapshot, extractStep, {
 *   adapters: { llm },
 *   runId: `recompute-${id}`,
 *   validate: true,
 * });
 * if (result.ok) {
 *   const { deltaDiff, commandsDiff } = result.value;
 *   if (deltaDiff && !deltaDiff.equal) {
 *     console.log("State changed:", formatDiff(deltaDiff));
 *   }
 * }
 * ```
 */
export async function recompute<
  TInput,
  TDelta,
  TAdapters extends BaseAdapters = BaseAdapters,
>(
  snapshot: Snapshot,
  step: Step<TInput, TDelta, TAdapters>,
  ...args: OptionsArg<TAdapters, RecomputeOptions<TAdapters>>
): Promise<Result<RecomputeResult<TDelta>, RecomputeError>> {
  const options = (args[0] ?? {}) as RecomputeOptions<TAdapters>;
  const adapters = options.adapters ?? ({} as TAdapters);

  let runId = options.runId;
  if (!runId) {
    if (typeof crypto?.randomUUID !== "function") {
      throw new Error(
        "recompute() requires Web Crypto API (Node 20+, Bun, Deno, modern browsers). " +
          "Provide runId explicitly or upgrade your runtime.",
      );
    }
    runId = crypto.randomUUID();
  }

  // Derive context from snapshot metadata + options
  const ctx = createContextFactory(adapters)({
    workflowId: snapshot.workflowId,
    workflowVersion: snapshot.workflowVersion,
    runId,
    onArtifact: options.onArtifact,
  });

  // Verify input hash matches
  const currentInputHash = await hashValue(snapshot.input);
  if (currentInputHash !== snapshot.inputHash) {
    return err({
      code: "INPUT_HASH_MISMATCH",
      message: `Input hash mismatch: expected ${snapshot.inputHash}, got ${currentInputHash}`,
    });
  }

  // Validate input against step schema if requested.
  // When validating, use the parsed result (respects Zod transforms/defaults)
  // to match runStep semantics.
  let stepInput = snapshot.input as TInput;
  if (options.validate) {
    const inputResult = step.inputSchema.safeParse(snapshot.input);
    if (!inputResult.success) {
      return err({
        code: "INPUT_VALIDATION",
        message:
          `Input validation failed for step "${step.name}": ${formatZodError(inputResult.error)}. ` +
          `Schema may have changed since baseline was captured. Recapture with \`verist capture\`.`,
        cause: inputResult.error,
      });
    }
    stepInput = inputResult.data as TInput;
  }

  // Execute the step with fresh adapters
  let newOutput: StepOutput<TDelta>;
  try {
    newOutput = await step.run(stepInput, ctx);
  } catch (cause) {
    return err({
      code: "EXECUTION_FAILED",
      message: cause instanceof Error ? cause.message : String(cause),
      cause,
    });
  }

  // Validate output schema (single safeParse). When validation succeeds,
  // use the parsed delta for diffing to match runStep semantics (reflects
  // Zod defaults, coercions, transforms). When it fails, diff raw delta.
  let deltaForDiff: unknown = newOutput.delta;
  let parsedDelta: Delta<TDelta> | undefined;
  let schemaViolations: SchemaViolation[] = [];

  if (options.validate) {
    const outputSchema = options.strictOutput
      ? step.deltaSchema
      : step.outputDeltaSchema;
    const outputResult = outputSchema.safeParse(newOutput.delta);
    if (outputResult.success) {
      parsedDelta = outputResult.data as Delta<TDelta>;
      deltaForDiff = parsedDelta;
    } else {
      schemaViolations = (
        outputResult.error as import("zod").ZodError
      ).issues.map((issue) => mapZodIssueToViolation(issue, newOutput.delta));
    }
  }

  // Diff delta against baseline
  const originalOutputArtifact = snapshot.artifacts.find(
    (a) => a.kind === "step-output",
  );
  const originalOutput = isStepOutputShape(originalOutputArtifact?.content)
    ? (originalOutputArtifact.content as StepOutput<TDelta>)
    : undefined;

  const comparable = originalOutput !== undefined;
  const deltaDiff = comparable
    ? diff(originalOutput.delta, deltaForDiff)
    : undefined;

  // Diff commands (control-flow decisions)
  const originalCommands = extractSnapshotCommands(snapshot);
  const commandsDiff =
    originalCommands !== undefined
      ? diff(
          normalizeCommands(originalCommands),
          normalizeCommands(newOutput.commands),
        )
      : undefined;

  // Compute status (highest severity wins)
  const status: RecomputeStatus =
    schemaViolations.length > 0
      ? "schema_violation"
      : deltaDiff && !deltaDiff.equal
        ? "value_changed"
        : "clean";

  // Resolve capture options: true → full content, false/undefined → skip, object → pass through
  const captureArtifacts = options.captureArtifacts;
  const shouldCapture =
    captureArtifacts !== undefined && captureArtifacts !== false;
  const captureOpts =
    captureArtifacts === true ? undefined : captureArtifacts || undefined;

  return ok({
    output: newOutput as StepOutput<unknown>,
    parsedDelta,
    status,
    comparable,
    deltaDiff,
    commandsDiff,
    schemaViolations,
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

  const originalCommands = extractSnapshotCommands(original);
  const updatedCommands = extractSnapshotCommands(updated);

  const commandsDiff =
    originalCommands !== undefined && updatedCommands !== undefined
      ? diff(
          normalizeCommands(originalCommands),
          normalizeCommands(updatedCommands),
        )
      : undefined;

  return { inputDiff, deltaDiff, commandsDiff };
}

function formatZodError(error: import("zod").ZodError): string {
  return error.issues
    .map(
      (issue) =>
        `${formatPath(issue.path as (string | number)[])}: ${issue.message}`,
    )
    .join("; ");
}

/**
 * Map a ZodIssue to a SchemaViolation with a stable `kind` discriminator.
 *
 * - `invalid_type` where the actual value at the path is `undefined` → `"missing"`
 * - `invalid_type` otherwise → `"type"`
 * - `custom` / refinement codes → `"refinement"`
 * - everything else → `"other"`
 *
 * "missing" is detected by resolving the issue path in the original value,
 * avoiding dependence on Zod-version-specific issue fields or message formats.
 */
function mapZodIssueToViolation(
  issue: import("zod").ZodError["issues"][number],
  rootValue: unknown,
): SchemaViolation {
  let kind: SchemaViolation["kind"];

  if (issue.code === "invalid_type") {
    const actual = resolvePathValue(rootValue, issue.path);
    kind = actual === undefined ? "missing" : "type";
  } else if (
    issue.code === "custom" ||
    issue.code === "too_small" ||
    issue.code === "too_big"
  ) {
    kind = "refinement";
  } else {
    kind = "other";
  }

  return {
    path: issue.path as (string | number)[],
    kind,
    message: issue.message,
  };
}

/** Resolve a dotted path in a nested value. Returns undefined if any segment is missing. */
function resolvePathValue(value: unknown, path: PropertyKey[]): unknown {
  let current = value;
  for (const key of path) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return undefined;
    }
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}
