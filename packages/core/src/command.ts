import { z } from "zod";

/**
 * Declarative commands returned by steps.
 *
 * Commands express "what should happen next" without executing it.
 * The external runner/orchestrator interprets and executes commands.
 *
 * This enables control flow (branching, fan-out, human-in-the-loop)
 * while keeping steps pure and orchestration external.
 *
 * @see docs/specs/commands.md for runner contract
 */

/**
 * Request another step to run with given input.
 * Transport-agnostic: adapters map to queue, function call, or task.
 */
export interface InvokeCommand {
  type: "invoke";
  step: string;
  input: unknown;
}

/**
 * Schedule the same step to run multiple times with different inputs.
 * Useful for parallel processing of items.
 */
export interface FanoutCommand {
  type: "fanout";
  step: string;
  inputs: unknown[];
}

/**
 * Request human review before continuing.
 * Acts as a barrier: all sibling commands are deferred until review resolves.
 */
export interface ReviewCommand {
  type: "review";
  reason: string;
  payload?: unknown;
}

/**
 * Emit a domain event to an external topic/queue.
 * For integration with event-driven systems.
 */
export interface EmitCommand {
  type: "emit";
  topic: string;
  payload: unknown;
}

export type Command =
  | InvokeCommand
  | FanoutCommand
  | ReviewCommand
  | EmitCommand;

/** Zod schema for InvokeCommand */
export const InvokeCommandSchema = z.object({
  type: z.literal("invoke"),
  step: z.string(),
  input: z.unknown(),
});

/** Zod schema for FanoutCommand */
export const FanoutCommandSchema = z.object({
  type: z.literal("fanout"),
  step: z.string(),
  inputs: z.array(z.unknown()),
});

/** Zod schema for ReviewCommand */
export const ReviewCommandSchema = z.object({
  type: z.literal("review"),
  reason: z.string(),
  payload: z.unknown().optional(),
});

/** Zod schema for EmitCommand */
export const EmitCommandSchema = z.object({
  type: z.literal("emit"),
  topic: z.string(),
  payload: z.unknown(),
});

/** Zod schema for Command (discriminated union) */
export const CommandSchema = z.discriminatedUnion("type", [
  InvokeCommandSchema,
  FanoutCommandSchema,
  ReviewCommandSchema,
  EmitCommandSchema,
]);

/**
 * Helper to create an invoke command.
 */
export function invoke(step: string, input: unknown): InvokeCommand {
  return { type: "invoke", step, input };
}

/**
 * Helper to create a fanout command.
 */
export function fanout(step: string, inputs: unknown[]): FanoutCommand {
  return { type: "fanout", step, inputs };
}

/**
 * Helper to create a review command.
 */
export function review(reason: string, payload?: unknown): ReviewCommand {
  return { type: "review", reason, payload };
}

/**
 * Helper to create an emit command.
 */
export function emit(topic: string, payload: unknown): EmitCommand {
  return { type: "emit", topic, payload };
}
