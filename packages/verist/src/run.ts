// SPDX-License-Identifier: Apache-2.0

import { ZodError } from "zod";
import type { Artifact, OnArtifact } from "./artifact.ts";
import type { Command } from "./command.ts";
import type { ContextFactory } from "./context.ts";
import { createContextFactory } from "./context.ts";
import type { AuditEvent } from "./event.ts";
import { isStepFailure } from "./fail.ts";
import type { Result } from "./result.ts";
import { err, ok } from "./result.ts";
import type { Step, StepReturn } from "./step.ts";
import type { AdaptersOption, BaseAdapters, OptionsArg } from "./types.ts";

/**
 * Step execution error codes.
 *
 * Kernel-owned codes: `input_validation`, `output_validation`, `execution_failed`.
 * Steps may return any string code via `fail()` — runners should treat
 * non-kernel codes as domain-specific.
 */
export type StepErrorCode =
  | "input_validation"
  | "output_validation"
  | "execution_failed"
  | (string & {});

export interface StepError {
  code: StepErrorCode;
  message: string;
  /** Always present — normalized by runStep(). */
  retryable: boolean;
  cause?: unknown;
}

/**
 * Result of a successful step execution.
 * Output is flattened: `output`, `events`, and `commands` are top-level fields.
 */
export interface StepResult<TInput, TOutput extends object> {
  /** Validated input that was passed to the step. Treat as immutable. */
  input: TInput;
  /** Partial state update (validated). */
  output: Partial<TOutput>;
  /** Audit events emitted during execution. */
  events: AuditEvent[];
  /** Commands expressing "what should happen next". */
  commands?: Command[];
  /**
   * Adapter-emitted artifacts collected during execution (batch).
   * Same artifacts are also streamed via `onArtifact` callback if provided.
   * Contains only non-reserved kinds (e.g., `llm-input`, `llm-output`).
   * Reserved kinds (`step-output`, `step-commands`) are created at snapshot time.
   */
  artifacts: Artifact[];
  stepName: string;
  workflowId: string;
  workflowVersion: string;
  runId: string;
}

/**
 * Parameters for running a step.
 */
export interface RunStepInput<
  TInput,
  TOutput extends object,
  TAdapters extends BaseAdapters = BaseAdapters,
> {
  step: Step<TInput, TOutput, TAdapters>;
  input: TInput;
  contextFactory: ContextFactory<TAdapters>;
  workflowId: string;
  workflowVersion: string;
  runId: string;
  /** Optional callback for capturing artifacts during execution. */
  onArtifact?: OnArtifact;
}

/**
 * Execute a workflow step with validation and error handling.
 *
 * 1. Validates input against step's input schema
 * 2. Creates context via factory
 * 3. Executes step's run function
 * 4. Validates output against step's partial output schema
 * 5. Returns Result with StepResult or StepError
 *
 * @example
 * const result = await runStep({
 *   step: workflow.getStep("extract"),
 *   input: { documentId: "doc-123" },
 *   contextFactory: createContextFactory({ db: mockDb }),
 *   workflowId: "verify-document",
 *   workflowVersion: "1.0.0",
 *   runId: crypto.randomUUID(),
 * });
 *
 * if (result.ok) {
 *   console.log(result.value.output);
 * }
 */
export async function runStep<
  TInput,
  TOutput extends object,
  TAdapters extends BaseAdapters = BaseAdapters,
>(
  params: RunStepInput<TInput, TOutput, TAdapters>,
): Promise<Result<StepResult<TInput, TOutput>, StepError>> {
  const {
    step,
    input,
    contextFactory,
    workflowId,
    workflowVersion,
    runId,
    onArtifact,
  } = params;

  // Validate input
  const inputResult = step.inputSchema.safeParse(input);
  if (!inputResult.success) {
    return err({
      code: "input_validation",
      message: formatZodError(inputResult.error),
      retryable: false,
      cause: inputResult.error,
    });
  }

  // Collect events emitted via ctx.emitEvent()
  const contextEvents: AuditEvent[] = [];

  // Collect artifacts emitted by adapters via ctx.onArtifact
  const collectedArtifacts: Artifact[] = [];
  const wrappedOnArtifact: OnArtifact = (artifact) => {
    collectedArtifacts.push(artifact);
    onArtifact?.(artifact);
  };

  // Create context with version for audit correlation
  const ctx = contextFactory({
    workflowId,
    workflowVersion,
    runId,
    onArtifact: wrappedOnArtifact,
    emitEvent: (event) => contextEvents.push(event),
  });

  // Execute step
  let stepReturn: StepReturn<TOutput>;
  try {
    const returnValue = await step.run(inputResult.data, ctx);

    // Detect structured failure (fail() returns a tagged StepFailure)
    if (isStepFailure(returnValue)) {
      return err({
        code: returnValue.code,
        message: returnValue.message,
        retryable: returnValue.retryable ?? false,
        cause: returnValue.cause,
      });
    }

    stepReturn = returnValue;
  } catch (cause) {
    return err({
      code: "execution_failed",
      message: cause instanceof Error ? cause.message : String(cause),
      retryable: false,
      cause,
    });
  }

  // Validate output
  const outputResult = step.partialOutputSchema.safeParse(stepReturn.output);
  if (!outputResult.success) {
    return err({
      code: "output_validation",
      message: formatZodError(outputResult.error),
      retryable: false,
      cause: outputResult.error,
    });
  }

  // Merge context events with step-returned events
  const events = [...contextEvents, ...(stepReturn.events ?? [])];

  return ok({
    input: inputResult.data,
    output: outputResult.data as Partial<TOutput>,
    events,
    commands: stepReturn.commands,
    artifacts: collectedArtifacts,
    stepName: step.name,
    workflowId,
    workflowVersion,
    runId,
  });
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

/**
 * Options for the simplified run() function.
 * `adapters` is required when the step declares adapters, optional otherwise.
 */
export type RunOptions<TAdapters extends BaseAdapters = BaseAdapters> =
  RunOptionsBase & AdaptersOption<TAdapters>;

interface RunOptionsBase {
  /** Override generated runId. Defaults to random UUID. */
  runId?: string;
  /** Override workflowId. Defaults to step name. */
  workflowId?: string;
  /** Override workflowVersion. Defaults to "0.0.0". */
  workflowVersion?: string;
  /** Callback notified for each artifact emitted during execution (by adapters via ctx.onArtifact). */
  onArtifact?: OnArtifact;
}

/**
 * Simplified step execution for quick adoption.
 *
 * This is a convenience wrapper around `runStep` with sensible defaults:
 * - workflowId defaults to step.name
 * - workflowVersion defaults to "0.0.0"
 * - runId defaults to crypto.randomUUID()
 *
 * Use this for quick prototyping or single-step scenarios.
 * Graduate to `runStep` when you need explicit workflow/version control,
 * multi-step workflows, or stable version tracking across deployments.
 *
 * Requires a runtime with Web Crypto API (Node 20+, Bun, Deno, modern browsers).
 *
 * @example
 * const summarize = defineStep({
 *   name: "summarize",
 *   input: z.object({ text: z.string() }),
 *   output: z.object({ summary: z.string() }),
 *   run: async (input) => ({
 *     output: { summary: `Summary of: ${input.text}` },
 *   }),
 * });
 *
 * // No adapters needed — options object is optional
 * const result = await run(summarize, { text: "Hello" });
 *
 * if (result.ok) {
 *   console.log(result.value.output);
 * }
 */
export async function run<
  TInput,
  TOutput extends object,
  TAdapters extends BaseAdapters = BaseAdapters,
>(
  step: Step<TInput, TOutput, TAdapters>,
  input: NoInfer<TInput>,
  ...args: OptionsArg<TAdapters, RunOptions<TAdapters>>
): Promise<Result<StepResult<TInput, TOutput>, StepError>> {
  const opts = (args[0] ?? {}) as RunOptions<TAdapters>;
  const workflowId = opts.workflowId ?? step.name;
  const workflowVersion = opts.workflowVersion ?? "0.0.0";
  const adapters = opts.adapters ?? ({} as TAdapters);

  let runId = opts.runId;
  if (!runId) {
    if (typeof crypto?.randomUUID !== "function") {
      throw new Error(
        "run() requires Web Crypto API (Node 20+, Bun, Deno, modern browsers). " +
          "Provide runId explicitly or upgrade your runtime.",
      );
    }
    runId = crypto.randomUUID();
  }

  return runStep({
    step,
    input,
    contextFactory: createContextFactory(adapters),
    workflowId,
    workflowVersion,
    runId,
    onArtifact: opts.onArtifact,
  });
}
