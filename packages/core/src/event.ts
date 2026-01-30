import { z } from "zod";

/**
 * LLM call trace for audit logging.
 * Captures model, prompt, response, and timing.
 *
 * Hashes are always required for audit correlation and deduplication.
 * Raw input/output are optional to support regulated environments
 * that cannot store prompts/completions.
 */
export interface LLMTrace {
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  inputHash: string;
  outputHash: string;
  input?: unknown;
  output?: unknown;
}

/**
 * Audit event emitted by workflow steps.
 * Semi-structured: type is required, payload is flexible.
 */
export interface AuditEvent {
  type: string;
  payload?: Record<string, unknown>;
  llmTrace?: LLMTrace;
}

/** Zod schema for LLMTrace */
export const LLMTraceSchema = z.object({
  model: z.string(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  inputHash: z.string(),
  outputHash: z.string(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
});

/** Zod schema for AuditEvent */
export const AuditEventSchema = z.object({
  type: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
  llmTrace: LLMTraceSchema.optional(),
});
