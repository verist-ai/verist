// SPDX-License-Identifier: Apache-2.0

import { ZodError } from "zod";
import type { Artifact, OnArtifact } from "./artifact.ts";
import { createArtifact } from "./artifact.ts";
import type { ContextFactory } from "./context.ts";
import { createContextFactory } from "./context.ts";
import type { Result } from "./result.ts";
import { err, ok } from "./result.ts";
import type { Step, StepOutput } from "./step.ts";
import type {
  AdaptersOption,
  BaseAdapters,
  Delta,
  OptionsArg,
} from "./types.ts";

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
  /**
   * All artifacts emitted during execution (adapter + step-output).
   * Always includes at least the step-output artifact.
   * These are the runtime collection — not automatically persisted to snapshots.
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

  // Collect all artifacts emitted during execution
  const artifacts: Artifact[] = [];
  const collectArtifact: OnArtifact = (artifact) => {
    artifacts.push(artifact);
    onArtifact?.(artifact);
  };

  // Create context with version for audit correlation
  const ctx = contextFactory({
    workflowId,
    workflowVersion,
    runId,
    onArtifact: collectArtifact,
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

  // Always emit step-output artifact (full StepOutput including commands)
  collectArtifact(await createArtifact("step-output", validatedOutput));

  return ok({
    input: inputResult.data,
    output: validatedOutput,
    artifacts,
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
  /**
   * Callback notified for each artifact emitted during execution.
   * Artifacts are always collected in result.artifacts regardless of this callback.
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
 *   run: async (input) => ({
 *     delta: { summary: `Summary of: ${input.text}` },
 *     events: [{ type: "summary_created" }],
 *   }),
 * });
 *
 * // No adapters needed — options object is optional
 * const result = await run(summarize, { text: "Hello" });
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
  input: NoInfer<TInput>,
  ...args: OptionsArg<TAdapters, RunOptions<TAdapters>>
): Promise<Result<StepResult<TInput, TDelta>, StepError>> {
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
