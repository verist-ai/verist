// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type { Command } from "./command.ts";
import type { StepContext } from "./context.ts";
import type { AuditEvent } from "./event.ts";
import type { BaseAdapters } from "./types.ts";

/** Schema with optional partial() method (ZodObject has this) */
type PartialableSchema<T> = z.ZodType<T> & {
  partial?: () => z.ZodType<Partial<T>>;
};

/**
 * Return value from a step's run function.
 * Contains state output, audit events, and optional commands.
 *
 * Commands express "what should happen next" declaratively.
 * The external runner/orchestrator interprets and executes them.
 */
export interface StepReturn<TOutput extends object> {
  /**
   * Partial state update. Only include fields that changed.
   *
   * Note: TypeScript widens ternary results (e.g. `x ? "a" : "b"` becomes
   * `string`). For literal union outputs, extract to a typed variable:
   *
   * ```ts
   * // ❌ widens to string
   * output: { status: cond ? "ok" : "error" }
   *
   * // ✅ preserves literal union
   * const status: "ok" | "error" = cond ? "ok" : "error";
   * return { output: { status }, ... };
   * ```
   */
  output: Partial<TOutput>;
  events?: AuditEvent[];
  commands?: Command[];
}

/**
 * Configuration for defining a step.
 *
 * Adapter types are inferred from the `ctx` parameter annotation on `run`.
 * Steps without adapters can omit the annotation entirely.
 */
export interface StepConfig<
  TInput,
  TOutput extends object,
  TAdapters extends BaseAdapters = BaseAdapters,
> {
  name: string;
  input: z.ZodType<TInput>;
  /**
   * Schema of fields this step can contribute to workflow state.
   * The output returned by run() is validated as Partial<output>.
   */
  output: z.ZodType<TOutput>;
  run: (
    input: TInput,
    ctx: StepContext<TAdapters>,
  ) => Promise<StepReturn<TOutput>>;
}

/**
 * A defined workflow step.
 * Immutable after creation.
 */
export interface Step<
  TInput,
  TOutput extends object,
  TAdapters extends BaseAdapters = BaseAdapters,
> {
  readonly name: string;
  readonly inputSchema: z.ZodType<TInput>;
  /** Schema of fields this step can contribute to workflow state. */
  readonly outputSchema: z.ZodType<TOutput>;
  /** Schema for validating step output. Derived as output.partial() for objects. */
  readonly partialOutputSchema: z.ZodType<Partial<TOutput>>;
  readonly run: (
    input: TInput,
    ctx: StepContext<TAdapters>,
  ) => Promise<StepReturn<TOutput>>;
}

/** Extract the input type from a Step. */
export type StepInput<S extends Step<any, any, any>> =
  S extends Step<infer I, any, any> ? I : never;

/** Extract the full output type from a Step (runtime output is `Partial` of this). */
export type StepOutput<S extends Step<any, any, any>> =
  S extends Step<any, infer O extends object, any> ? O : never;

/**
 * Define a workflow step with typed input and output schemas.
 *
 * The output schema defines which fields this step can contribute to workflow state.
 * The actual output returned by run() is validated as Partial<output> — you don't
 * have to set all fields, only the ones you're changing.
 *
 * @example
 * const extract = defineStep({
 *   name: "extract",
 *   input: z.object({ documentId: z.string() }),
 *   output: z.object({ claims: z.array(z.string()) }),
 *   run: async (input, ctx: StepContext<{ db: DbAdapter }>) => {
 *     // ctx.adapters.db is fully typed
 *     const doc = await ctx.adapters.db.getDocument(input.documentId);
 *     return {
 *       output: { claims: ["claim1"] },
 *       events: [{ type: "claims_extracted" }],
 *     };
 *   },
 * });
 */
export function defineStep<
  TInput,
  TOutput extends object,
  TAdapters extends BaseAdapters = BaseAdapters,
>(
  config: StepConfig<TInput, TOutput, TAdapters>,
): Step<TInput, TOutput, TAdapters> {
  const outputSchema = config.output as PartialableSchema<TOutput>;
  const partialOutputSchema =
    typeof outputSchema.partial === "function"
      ? outputSchema.partial()
      : (config.output as z.ZodType<Partial<TOutput>>);

  return {
    name: config.name,
    inputSchema: config.input,
    outputSchema: config.output,
    partialOutputSchema,
    run: config.run,
  };
}
