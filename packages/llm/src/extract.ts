// SPDX-License-Identifier: Apache-2.0

import type { AuditEvent, OnArtifact, Result } from "verist";
import { err, ok } from "verist";
import type {
  LLMCompleteOpts,
  LLMErrorCode,
  LLMProvider,
  LLMRequest,
  LLMResponse,
} from "./types";

/**
 * Result of a successful extraction.
 */
export interface ExtractResult<T> {
  data: T;
  response: LLMResponse;
}

/**
 * Error codes for extract() — extends LLMErrorCode with parse failures.
 *
 * - `json_error` — LLM returned non-JSON content (retryable, model may do better)
 * - `schema_error` — valid JSON but doesn't match schema (not retryable, likely a prompt issue)
 */
export type ExtractErrorCode = LLMErrorCode | "json_error" | "schema_error";

/**
 * Structured error for extract operations.
 */
export interface ExtractError {
  code: ExtractErrorCode;
  message: string;
  retryable: boolean;
}

/** Strip ```json fences that some providers wrap around JSON output. */
function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    // Remove opening fence (```json or ```)
    const afterOpen = trimmed.replace(/^```\w*\r?\n?/, "");
    // Remove closing fence
    return afterOpen.replace(/\n?```\s*$/, "");
  }
  return trimmed;
}

/** Minimal context shape that extract() can read from. */
interface ExtractContext {
  adapters: { llm: LLMProvider };
  onArtifact?: OnArtifact;
  emitEvent: (event: AuditEvent) => void;
}

/**
 * Extract structured data from an LLM response.
 *
 * Combines `complete()` → JSON.parse → schema.parse into a single call.
 * The schema uses a generic `{ parse }` interface, so any validator works
 * (Zod, ArkType, custom) without coupling to a specific library.
 *
 * Accepts either a step context (reads `ctx.adapters.llm`, `ctx.onArtifact`,
 * and `ctx.emitEvent` automatically) or an explicit `LLMProvider`.
 *
 * When using the context overload, an `"llm.extracted"` audit event is
 * auto-emitted via `ctx.emitEvent` on success (with the LLM trace attached).
 *
 * @example
 * ```typescript
 * // With step context (reads ctx.adapters.llm, auto-emits audit event)
 * const result = await extract(ctx, request, schema);
 *
 * // With explicit provider
 * const result = await extract(llm, request, schema, opts);
 * ```
 */
export function extract<T>(
  ctx: ExtractContext,
  request: LLMRequest,
  schema: { parse(value: unknown): T },
  opts?: LLMCompleteOpts,
): Promise<Result<ExtractResult<T>, ExtractError>>;
export function extract<T>(
  llm: LLMProvider,
  request: LLMRequest,
  schema: { parse(value: unknown): T },
  opts?: LLMCompleteOpts,
): Promise<Result<ExtractResult<T>, ExtractError>>;
export async function extract<T>(
  ctxOrLlm: ExtractContext | LLMProvider,
  request: LLMRequest,
  schema: { parse(value: unknown): T },
  opts?: LLMCompleteOpts,
): Promise<Result<ExtractResult<T>, ExtractError>> {
  let llm: LLMProvider;
  let resolvedOpts: LLMCompleteOpts | undefined;
  let ctx: ExtractContext | undefined;

  // Discriminate: LLMProvider has complete(), context has adapters
  if (typeof (ctxOrLlm as LLMProvider).complete === "function") {
    llm = ctxOrLlm as LLMProvider;
    resolvedOpts = opts;
  } else {
    ctx = ctxOrLlm as ExtractContext;
    llm = ctx.adapters.llm;
    // ctx.onArtifact provides default; explicit opts override
    resolvedOpts = ctx.onArtifact
      ? { onArtifact: ctx.onArtifact, ...opts }
      : opts;
  }

  const llmResult = await llm.complete(request, resolvedOpts);
  if (!llmResult.ok) {
    return err(llmResult.error);
  }

  const response = llmResult.value;
  const raw = stripJsonFences(response.content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return err({
      code: "json_error",
      message: `JSON.parse failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      retryable: true,
    });
  }

  let data: T;
  try {
    data = schema.parse(parsed);
  } catch (cause) {
    return err({
      code: "schema_error",
      message: `Schema validation failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      retryable: false,
    });
  }

  // Auto-emit audit event when using context overload
  if (ctx) {
    ctx.emitEvent({ type: "llm.extracted", llmTrace: response.trace });
  }

  return ok({ data, response });
}
