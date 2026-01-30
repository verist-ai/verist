import type { z } from "zod";
import type { AuditEvent } from "./event.ts";
import type { Command } from "./command.ts";
import type { StepContext } from "./context.ts";
import type { BaseAdapters, Delta } from "./types.ts";

/** Schema with optional partial() method (ZodObject has this) */
type PartialableSchema<T> = z.ZodType<T> & {
  partial?: () => z.ZodType<Partial<T>>;
};

/**
 * Output from a step's run function.
 * Contains state delta, audit events, and optional commands.
 *
 * Commands express "what should happen next" declaratively.
 * The external runner/orchestrator interprets and executes them.
 */
export interface StepOutput<TDelta> {
  delta: Delta<TDelta>;
  events: AuditEvent[];
  commands?: Command[];
}

/**
 * Configuration for defining a step.
 */
export interface StepConfig<
  TInput,
  TDelta,
  TAdapters extends BaseAdapters = BaseAdapters,
> {
  name: string;
  input: z.ZodType<TInput>;
  /**
   * Schema of fields this step can contribute to workflow state.
   * The delta returned by run() is validated as Partial<delta>.
   */
  delta: z.ZodType<TDelta>;
  run: (
    input: TInput,
    ctx: StepContext<TAdapters>,
  ) => Promise<StepOutput<TDelta>>;
}

/**
 * A defined workflow step.
 * Immutable after creation.
 */
export interface Step<
  TInput,
  TDelta,
  TAdapters extends BaseAdapters = BaseAdapters,
> {
  readonly name: string;
  readonly inputSchema: z.ZodType<TInput>;
  /** Schema of fields this step can contribute to workflow state. */
  readonly deltaSchema: z.ZodType<TDelta>;
  /** Schema for validating output delta. Derived as delta.partial() for objects. */
  readonly outputDeltaSchema: z.ZodType<Delta<TDelta>>;
  readonly run: (
    input: TInput,
    ctx: StepContext<TAdapters>,
  ) => Promise<StepOutput<TDelta>>;
}

/**
 * Define a workflow step with typed input and delta schemas.
 *
 * The delta schema defines which fields this step can contribute to workflow state.
 * The actual delta returned by run() is validated as Partial<delta> — you don't
 * have to set all fields, only the ones you're changing.
 *
 * @example
 * const extract = defineStep({
 *   name: "extract",
 *   input: z.object({ documentId: z.string() }),
 *   delta: z.object({ claims: z.array(z.string()) }),
 *   run: async (input, ctx) => {
 *     const doc = await ctx.adapters.db.getDocument(input.documentId);
 *     return {
 *       delta: { claims: ["claim1"] },
 *       events: [{ type: "claims_extracted" }],
 *     };
 *   },
 * });
 */
export function defineStep<
  TInput,
  TDelta,
  TAdapters extends BaseAdapters = BaseAdapters,
>(
  config: StepConfig<TInput, TDelta, TAdapters>,
): Step<TInput, TDelta, TAdapters> {
  const deltaSchema = config.delta as PartialableSchema<TDelta>;
  const outputDeltaSchema =
    typeof deltaSchema.partial === "function"
      ? deltaSchema.partial()
      : (config.delta as z.ZodType<Delta<TDelta>>);

  return {
    name: config.name,
    inputSchema: config.input,
    deltaSchema: config.delta,
    outputDeltaSchema,
    run: config.run,
  };
}
