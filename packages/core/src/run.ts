// SPDX-License-Identifier: Apache-2.0

import { ZodError } from "zod";
import type { OnArtifact } from "./artifact.ts";
import { createArtifact } from "./artifact.ts";
import type { ContextFactory } from "./context.ts";
import { createContextFactory } from "./context.ts";
import type { Result } from "./result.ts";
import { err, ok } from "./result.ts";
import type { Step, StepOutput } from "./step.ts";
import type { BaseAdapters, Delta } from "./types.ts";

/**
 * Step execution error types.
 */
export type StepErrorCode =
  | "INPUT_VALIDATION"
  | "OUTPUT_VALIDATION"
  | "EXECUTION";

export interface StepError {
  code: StepErrorCode;
  message: string;
  cause?: unknown;
}

/**
 * Result of a successful step execution.
 * Includes validated input for replay and version for audit correlation.
 */
export interface StepResult<TInput, TDelta> {
  /** Validated input that was passed to the step. Treat as immutable. */
  input: TInput;
  output: StepOutput<TDelta>;
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
  TDelta,
  TAdapters extends BaseAdapters = BaseAdapters,
> {
  step: Step<TInput, TDelta, TAdapters>;
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
 * 4. Validates output delta against step's delta schema
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
 *   console.log(result.value.output.delta);
 * }
 */
export async function runStep<
  TInput,
  TDelta,
  TAdapters extends BaseAdapters = BaseAdapters,
>(
  params: RunStepInput<TInput, TDelta, TAdapters>,
): Promise<Result<StepResult<TInput, TDelta>, StepError>> {
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
      code: "INPUT_VALIDATION",
      message: formatZodError(inputResult.error),
      cause: inputResult.error,
    });
  }

  // Create context with version for audit correlation
  const ctx = contextFactory({
    workflowId,
    workflowVersion,
    runId,
    onArtifact,
  });

  // Execute step
  let output: StepOutput<TDelta>;
  try {
    output = await step.run(inputResult.data, ctx);
  } catch (cause) {
    return err({
      code: "EXECUTION",
      message: cause instanceof Error ? cause.message : String(cause),
      cause,
    });
  }

  // Validate output delta
  const outputResult = step.outputDeltaSchema.safeParse(output.delta);
  if (!outputResult.success) {
    return err({
      code: "OUTPUT_VALIDATION",
      message: formatZodError(outputResult.error),
      cause: outputResult.error,
    });
  }

  const validatedOutput = {
    delta: outputResult.data as Delta<TDelta>,
    events: output.events,
    commands: output.commands,
  };

  // Emit step-output artifact if callback is provided
  if (onArtifact) {
    onArtifact(
      await createArtifact("step-output", {
        delta: validatedOutput.delta,
        events: validatedOutput.events,
      }),
    );
  }

  return ok({
    input: inputResult.data,
    output: validatedOutput,
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
 */
export interface RunOptions<TAdapters extends BaseAdapters = BaseAdapters> {
  adapters: TAdapters;
  /** Override generated runId. Defaults to random UUID. */
  runId?: string;
  /** Override workflowId. Defaults to step name. */
  workflowId?: string;
  /** Override workflowVersion. Defaults to "0.0.0". */
  workflowVersion?: string;
  /**
   * Callback for capturing artifacts during execution.
   * When provided, core emits step-output artifact with { delta, events }.
   * Adapters can emit their own artifacts (llm-input, llm-output, etc.) via context.
   */
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
 *   delta: z.object({ summary: z.string() }),
 *   run: async (input, ctx) => ({
 *     delta: { summary: await ctx.adapters.llm.summarize(input.text) },
 *     events: [{ type: "summary_created" }],
 *   }),
 * });
 *
 * const result = await run(summarize, { text: "Hello" }, {
 *   adapters: { llm: myLlmClient },
 * });
 *
 * if (result.ok) {
 *   console.log(result.value.output.delta);
 * }
 */
export async function run<
  TInput,
  TDelta,
  TAdapters extends BaseAdapters = BaseAdapters,
>(
  step: Step<TInput, TDelta, TAdapters>,
  input: TInput,
  options: RunOptions<TAdapters>,
): Promise<Result<StepResult<TInput, TDelta>, StepError>> {
  const workflowId = options.workflowId ?? step.name;
  const workflowVersion = options.workflowVersion ?? "0.0.0";

  let runId = options.runId;
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
    contextFactory: createContextFactory(options.adapters),
    workflowId,
    workflowVersion,
    runId,
    onArtifact: options.onArtifact,
  });
}
