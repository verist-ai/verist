// SPDX-License-Identifier: Apache-2.0

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

/**
 * Suspend workflow execution until external input arrives.
 * Unlike review (human approval), suspend waits for data/callbacks.
 * Sibling commands are discarded — the resumed step emits new commands.
 *
 * @see docs/specs/suspend.md
 */
export interface SuspendCommand {
  type: "suspend";
  reason: string;
  /** Serialized state for resume. MUST be JSON-serializable. */
  checkpoint: unknown;
  resumeStep?: string;
}

export type Command =
  | InvokeCommand
  | FanoutCommand
  | ReviewCommand
  | EmitCommand
  | SuspendCommand;

/** Zod schema for InvokeCommand */
export const InvokeCommandSchema = z
  .object({
    type: z.literal("invoke"),
    step: z.string(),
    input: z.unknown(),
  })
  .strict();

/** Zod schema for FanoutCommand */
export const FanoutCommandSchema = z
  .object({
    type: z.literal("fanout"),
    step: z.string(),
    inputs: z.array(z.unknown()),
  })
  .strict();

/** Zod schema for ReviewCommand */
export const ReviewCommandSchema = z
  .object({
    type: z.literal("review"),
    reason: z.string(),
    payload: z.unknown().optional(),
  })
  .strict();

/** Zod schema for EmitCommand */
export const EmitCommandSchema = z
  .object({
    type: z.literal("emit"),
    topic: z.string(),
    payload: z.unknown(),
  })
  .strict();

/**
 * Zod schema for SuspendCommand.
 *
 * NOTE: JSON-serializability of checkpoint is a runner responsibility.
 * Zod intentionally does not enforce it — validating arbitrary values
 * for JSON-serializability is impractical at the schema level.
 */
export const SuspendCommandSchema = z
  .object({
    type: z.literal("suspend"),
    reason: z.string(),
    checkpoint: z.unknown(),
    resumeStep: z.string().optional(),
  })
  .strict();

/** Zod schema for Command (discriminated union) */
export const CommandSchema = z.discriminatedUnion("type", [
  InvokeCommandSchema,
  FanoutCommandSchema,
  ReviewCommandSchema,
  EmitCommandSchema,
  SuspendCommandSchema,
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

/**
 * Helper to create a suspend command.
 * Does not validate resumeStep — use workflow.suspend() for type-safe step validation.
 */
export function suspend(args: Omit<SuspendCommand, "type">): SuspendCommand {
  return { type: "suspend", ...args };
}

// Command category helpers for validation, assertions, and readability

/**
 * Check if a command blocks workflow execution until resolved.
 * Blocking commands require external input before the workflow can continue.
 */
export function isBlockingCommand(
  cmd: Command,
): cmd is ReviewCommand | SuspendCommand {
  return cmd.type === "review" || cmd.type === "suspend";
}

/**
 * Check if a command dispatches execution to other steps.
 * Blocking commands also affect control flow but do not dispatch steps.
 */
export function isControlCommand(
  cmd: Command,
): cmd is InvokeCommand | FanoutCommand {
  return cmd.type === "invoke" || cmd.type === "fanout";
}

/**
 * Check if a command produces external side effects.
 * Side effect commands publish to external systems (queues, topics).
 */
export function isSideEffectCommand(cmd: Command): cmd is EmitCommand {
  return cmd.type === "emit";
}
