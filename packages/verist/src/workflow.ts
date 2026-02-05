// SPDX-License-Identifier: Apache-2.0

import type {
  FanoutCommand,
  InvokeCommand,
  ReviewCommand,
  SuspendCommand,
} from "./command.ts";
import type { Step } from "./step.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyStep = Step<any, any, any>;

/** Extract the input type from a step */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StepInput<S> = S extends Step<infer I, any, any> ? I : never;

/**
 * Configuration for defining a workflow.
 */
export interface WorkflowConfig<TSteps extends Record<string, AnyStep>> {
  name: string;
  /** Workflow version for replay semantics and audit correlation (required per Invariant #10). */
  version: string;
  steps: TSteps;
}

/**
 * A defined workflow containing named steps.
 */
export interface Workflow<TSteps extends Record<string, AnyStep>> {
  readonly name: string;
  /** Workflow version for replay semantics and audit correlation. */
  readonly version: string;
  readonly steps: TSteps;
  /** Get a step by name with full type inference. */
  getStep<K extends keyof TSteps>(name: K): TSteps[K];
  /** Create a typed invoke command for a step in this workflow. */
  invoke<K extends keyof TSteps & string>(
    step: K,
    input: StepInput<TSteps[K]>,
  ): InvokeCommand;
  /** Create a typed fanout command for a step in this workflow. */
  fanout<K extends keyof TSteps & string>(
    step: K,
    inputs: StepInput<TSteps[K]>[],
  ): FanoutCommand;
  /** Create a review command to request human approval. */
  review(args: { reason: string; payload?: unknown }): ReviewCommand;
  /**
   * Create a typed suspend command with resumeStep validation.
   * Type-level constraint (keyof steps) + runtime check against registered steps.
   */
  suspend<K extends keyof TSteps & string>(args: {
    reason: string;
    checkpoint: unknown;
    resumeStep?: K;
  }): SuspendCommand;
}

/**
 * Define a workflow with named steps.
 *
 * @example
 * const workflow = defineWorkflow({
 *   name: "verify-document",
 *   version: "1.0.0",
 *   steps: { extract, verify, summarize },
 * });
 *
 * // Type-safe step access
 * const step = workflow.getStep("extract");
 *
 * // Type-safe commands (preferred over untyped invoke/fanout)
 * return {
 *   output: { claims },
 *   events: [],
 *   commands: [workflow.invoke("verify", { claims })],
 * };
 */
export function defineWorkflow<TSteps extends Record<string, AnyStep>>(
  config: WorkflowConfig<TSteps>,
): Workflow<TSteps> {
  if (!config.name?.trim()) {
    throw new Error("defineWorkflow requires name");
  }
  if (!config.version?.trim()) {
    throw new Error(
      "defineWorkflow requires version for audit trail consistency",
    );
  }

  const stepNotFound = (step: string) =>
    new Error(`Step "${step}" not found in workflow "${config.name}"`);

  return {
    name: config.name,
    version: config.version,
    steps: config.steps,
    getStep<K extends keyof TSteps>(name: K): TSteps[K] {
      const step = config.steps[name];
      if (!step) {
        throw stepNotFound(String(name));
      }
      return step;
    },
    invoke<K extends keyof TSteps & string>(
      step: K,
      input: StepInput<TSteps[K]>,
    ): InvokeCommand {
      if (!config.steps[step]) {
        throw stepNotFound(step);
      }
      return { type: "invoke", step, input };
    },
    fanout<K extends keyof TSteps & string>(
      step: K,
      inputs: StepInput<TSteps[K]>[],
    ): FanoutCommand {
      if (!config.steps[step]) {
        throw stepNotFound(step);
      }
      return { type: "fanout", step, inputs };
    },
    review(args: { reason: string; payload?: unknown }): ReviewCommand {
      return args.payload !== undefined
        ? { type: "review", reason: args.reason, payload: args.payload }
        : { type: "review", reason: args.reason };
    },
    suspend<K extends keyof TSteps & string>(args: {
      reason: string;
      checkpoint: unknown;
      resumeStep?: K;
    }): SuspendCommand {
      if (args.resumeStep && !config.steps[args.resumeStep]) {
        throw stepNotFound(args.resumeStep);
      }
      return { type: "suspend", ...args };
    },
  };
}
