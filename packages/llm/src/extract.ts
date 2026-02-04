// SPDX-License-Identifier: Apache-2.0

import type { Result } from "@verist/core";
import { err, ok } from "@verist/core";
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
 * - `schema_error` — valid JSON but doesn't match schema (may indicate prompt issue)
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

/**
 * Extract structured data from an LLM response.
 *
 * Combines `complete()` → JSON.parse → schema.parse into a single call.
 * The schema uses a generic `{ parse }` interface, so any validator works
 * (Zod, ArkType, custom) without coupling to a specific library.
 *
 * @example
 * ```typescript
 * const result = await extract(llm, request, schema, {
 *   onArtifact: ctx.onArtifact,
 * });
 * if (!result.ok) throw new Error(`[${result.error.code}] ${result.error.message}`);
 * return {
 *   delta: result.value.data,
 *   events: [llmEvent("extracted", result.value.response)],
 * };
 * ```
 */
export async function extract<T>(
  llm: LLMProvider,
  request: LLMRequest,
  schema: { parse(value: unknown): T },
  opts?: LLMCompleteOpts,
): Promise<Result<ExtractResult<T>, ExtractError>> {
  const llmResult = await llm.complete(request, opts);
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
      retryable: true,
    });
  }

  return ok({ data, response });
}
