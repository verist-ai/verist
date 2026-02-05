// SPDX-License-Identifier: Apache-2.0

import type { OnArtifact } from "./artifact.ts";
import { hashValue } from "./artifact.ts";
import type { Command } from "./command.ts";
import { createContextFactory } from "./context.ts";
import { diff, formatPath } from "./diff.ts";
import type { AuditEvent } from "./event.ts";
import type { Result } from "./result.ts";
import { err, ok } from "./result.ts";
import type { StepResult } from "./run.ts";
import {
  captureArtifact,
  createSnapshotFromResult,
  normalizeCommands,
} from "./snapshot.ts";
import type { Step, StepReturn } from "./step.ts";
import type {
  AdaptersOption,
  BaseAdapters,
  CaptureOptions,
  DiffResult,
  OptionsArg,
  RecomputeResult,
  RecomputeStatus,
  SchemaViolation,
  Snapshot,
} from "./types.ts";

/** Check if value has step-output shape (object with `output` key). */
function isStepOutputShape(value: unknown): value is { output: unknown } {
  return value !== null && typeof value === "object" && "output" in value;
}

/** Extract the output data from a step-output artifact content. */
function extractOutputFromContent(content: { output: unknown }): unknown {
  return content.output;
}

/**
 * Extract normalized commands from a snapshot for diffing.
 *
 * Prefers `step-commands` artifact (already normalized at capture time),
 * falls back to raw commands in `step-output` (normalized here).
 * Returns `unknown[]` — callers diff directly without re-normalizing.
 */
function extractNormalizedCommands(snapshot: Snapshot): unknown[] | undefined {
  // step-commands artifact stores already-normalized projections
  const commandsArtifact = snapshot.artifacts.find(
    (a) => a.kind === "step-commands",
  );
  if (commandsArtifact?.content !== undefined) {
    if (isObjectArrayWithType(commandsArtifact.content)) {
      return commandsArtifact.content;
    }
  }
  // Fallback: raw commands inside step-output — normalize them
  const outputArtifact = snapshot.artifacts.find(
    (a) => a.kind === "step-output",
  );
  if (isStepOutputShape(outputArtifact?.content)) {
    const commands = (outputArtifact.content as { commands?: unknown })
      .commands;
    if (isObjectArrayWithType(commands)) {
      return normalizeCommands(commands as Command[]);
    }
  }
  return undefined;
}

/** Cheap shape check: array of objects with a string `type` field. */
function isObjectArrayWithType(
  value: unknown,
): value is Array<{ type: string }> {
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
  | "input_hash_mismatch"
  | "input_validation"
  | "execution_failed";

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
   * Enable schema validation (defaults to `true`):
   * - Input: strict (returns `err(input_validation)` on failure)
   * - Output: observational (populates `schemaViolations`, never gates).
   *   When output passes, the Zod-parsed output is used for diff and returned
   *   as `parsedOutput` (reflecting defaults, coercions, transforms).
   *
   * Set to `false` to skip all validation.
   */
  validate?: boolean;
  /**
   * Validate output against the full output schema instead of the partial
   * schema. Catches missing required fields that `.partial()` would allow.
   * Only effective when `validate` is also true.
   */
  strictOutput?: boolean;
}

/**
 * Recompute a step with fresh execution and compare to original.
 *
 * Accepts either a `Snapshot` (baseline) or a `StepResult` (fresh result).
 * When a StepResult is passed, a snapshot is created internally.
 *
 * Unlike replay (which uses stored artifacts), recompute makes fresh calls
 * to adapters (LLMs, databases, etc). This reveals what would change if
 * the step were run today with current models/data.
 *
 * Compares both output (state changes) and commands (control-flow decisions).
 * Events are audit logs and are not diffed.
 *
 * Validation is enabled by default. Set `validate: false` to skip.
 *
 * @example
 * ```typescript
 * const result = await recompute(snapshot, extractStep, { adapters: { llm } });
 * if (result.ok) {
 *   const { outputDiff, commandsDiff } = result.value;
 *   if (outputDiff && !outputDiff.equal) {
 *     console.log("State changed:", formatDiff(outputDiff));
 *   }
 * }
 * ```
 */
export async function recompute<
  TInput,
  TOutput extends object,
  TAdapters extends BaseAdapters = BaseAdapters,
>(
  baseline: Snapshot | StepResult<TInput, TOutput>,
  step: Step<TInput, TOutput, TAdapters>,
  ...args: OptionsArg<TAdapters, RecomputeOptions<TAdapters>>
): Promise<Result<RecomputeResult<TOutput>, RecomputeError>> {
  // Discriminate: Snapshot has capturedAt, StepResult doesn't
  let snapshot: Snapshot;
  if ("capturedAt" in baseline) {
    snapshot = baseline;
  } else {
    snapshot = await createSnapshotFromResult(baseline);
  }

  return recomputeFromSnapshot(snapshot, step, ...args);
}

async function recomputeFromSnapshot<
  TInput,
  TOutput extends object,
  TAdapters extends BaseAdapters = BaseAdapters,
>(
  snapshot: Snapshot,
  step: Step<TInput, TOutput, TAdapters>,
  ...args: OptionsArg<TAdapters, RecomputeOptions<TAdapters>>
): Promise<Result<RecomputeResult<TOutput>, RecomputeError>> {
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

  // Collect events emitted via ctx.emitEvent() (mirrors runStep)
  const contextEvents: AuditEvent[] = [];

  const ctx = createContextFactory(adapters)({
    workflowId: snapshot.workflowId,
    workflowVersion: snapshot.workflowVersion,
    runId,
    onArtifact: options.onArtifact,
    emitEvent: (event) => contextEvents.push(event),
  });

  // Verify input hash matches
  const currentInputHash = await hashValue(snapshot.input);
  if (currentInputHash !== snapshot.inputHash) {
    return err({
      code: "input_hash_mismatch",
      message: `Input hash mismatch: expected ${snapshot.inputHash}, got ${currentInputHash}`,
    });
  }

  // Validate input against step schema (defaults to true).
  // When validating, use the parsed result (respects Zod transforms/defaults)
  // to match runStep semantics.
  let stepInput = snapshot.input as TInput;
  if (options.validate !== false) {
    const inputResult = step.inputSchema.safeParse(snapshot.input);
    if (!inputResult.success) {
      return err({
        code: "input_validation",
        message:
          `Input validation failed for step "${step.name}": ${formatZodError(inputResult.error)}. ` +
          `Schema may have changed since baseline was captured. Recapture with \`verist capture\`.`,
        cause: inputResult.error,
      });
    }
    stepInput = inputResult.data as TInput;
  }

  // Execute the step with fresh adapters
  let newReturn: StepReturn<TOutput>;
  try {
    newReturn = await step.run(stepInput, ctx);
  } catch (cause) {
    return err({
      code: "execution_failed",
      message: cause instanceof Error ? cause.message : String(cause),
      cause,
    });
  }

  // Validate output schema (single safeParse). When validation succeeds,
  // use the parsed output for diffing to match runStep semantics (reflects
  // Zod defaults, coercions, transforms). When it fails, diff raw output.
  let outputForDiff: unknown = newReturn.output;
  let parsedOutput: Partial<TOutput> | undefined;
  let schemaViolations: SchemaViolation[] = [];

  if (options.validate !== false) {
    const outputSchema = options.strictOutput
      ? step.outputSchema
      : step.partialOutputSchema;
    const outputResult = outputSchema.safeParse(newReturn.output);
    if (outputResult.success) {
      parsedOutput = outputResult.data as Partial<TOutput>;
      outputForDiff = parsedOutput;
    } else {
      schemaViolations = (
        outputResult.error as import("zod").ZodError
      ).issues.map((issue) => mapZodIssueToViolation(issue, newReturn.output));
    }
  }

  // Diff output against baseline
  const originalOutputArtifact = snapshot.artifacts.find(
    (a) => a.kind === "step-output",
  );
  const originalContent = isStepOutputShape(originalOutputArtifact?.content)
    ? originalOutputArtifact.content
    : undefined;
  const originalOutput =
    originalContent !== undefined
      ? extractOutputFromContent(originalContent)
      : undefined;

  const comparable = originalContent !== undefined;
  const outputDiff = comparable
    ? diff(originalOutput, outputForDiff)
    : undefined;

  // Diff commands (control-flow decisions)
  // extractNormalizedCommands returns already-normalized projections
  const originalCommands = extractNormalizedCommands(snapshot);
  const commandsDiff =
    originalCommands !== undefined
      ? diff(originalCommands, normalizeCommands(newReturn.commands))
      : undefined;

  // Compute status (highest severity wins)
  const status: RecomputeStatus =
    schemaViolations.length > 0
      ? "schema_violation"
      : outputDiff && !outputDiff.equal
        ? "value_changed"
        : "clean";

  // Resolve capture options: true → full content, false/undefined → skip, object → pass through
  const captureArtifacts = options.captureArtifacts;
  const shouldCapture =
    captureArtifacts !== undefined && captureArtifacts !== false;
  const captureOpts =
    captureArtifacts === true ? undefined : captureArtifacts || undefined;

  // Merge context events with step-returned events (mirrors runStep)
  const events = [...contextEvents, ...(newReturn.events ?? [])];

  // Build artifact content in new shape for capture
  const artifactContent = {
    output: newReturn.output,
    events,
    commands: newReturn.commands,
  };

  return ok({
    rawOutput: newReturn.output,
    parsedOutput,
    status,
    comparable,
    outputDiff,
    commandsDiff,
    schemaViolations,
    outputArtifact: shouldCapture
      ? await captureArtifact("step-output", artifactContent, captureOpts)
      : undefined,
  });
}

/**
 * Compare two snapshots to see what changed.
 * Useful for comparing outputs across workflow versions.
 *
 * Compares output (state changes) and commands (control-flow decisions).
 * Events are audit logs and are not compared.
 *
 * `outputDiff` will be `undefined` if either snapshot:
 * - Is hash-only (content not stored)
 * - Has malformed step-output (missing `output` key)
 *
 * `commandsDiff` will be `undefined` if commands are unavailable in either snapshot.
 */
export function compareSnapshots(
  original: Snapshot,
  updated: Snapshot,
): {
  inputDiff: DiffResult;
  outputDiff: DiffResult | undefined;
  commandsDiff: DiffResult | undefined;
} {
  const inputDiff = diff(original.input, updated.input);

  const originalOutputArtifact = original.artifacts.find(
    (a) => a.kind === "step-output",
  );
  const updatedOutputArtifact = updated.artifacts.find(
    (a) => a.kind === "step-output",
  );

  // Require content with valid step-output shape for output comparison.
  const originalValid = isStepOutputShape(originalOutputArtifact?.content);
  const updatedValid = isStepOutputShape(updatedOutputArtifact?.content);

  const outputDiff =
    originalValid &&
    updatedValid &&
    originalOutputArtifact &&
    updatedOutputArtifact
      ? diff(
          extractOutputFromContent(
            originalOutputArtifact.content as { output: unknown },
          ),
          extractOutputFromContent(
            updatedOutputArtifact.content as { output: unknown },
          ),
        )
      : undefined;

  // extractNormalizedCommands returns already-normalized projections
  const originalCommands = extractNormalizedCommands(original);
  const updatedCommands = extractNormalizedCommands(updated);

  const commandsDiff =
    originalCommands !== undefined && updatedCommands !== undefined
      ? diff(originalCommands, updatedCommands)
      : undefined;

  return { inputDiff, outputDiff, commandsDiff };
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
