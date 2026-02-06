// SPDX-License-Identifier: Apache-2.0

import type { AuditEvent, StepContext } from "verist";
import type { LLMProvider, LLMResponse } from "./types";

// Types
export type {
  LLMCompleteOpts,
  LLMError,
  LLMErrorCode,
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMTrace,
} from "./types";

/** Step context with an LLM adapter. Shorthand for `StepContext<{ llm: LLMProvider }>`. */
export type LLMContext = StepContext<{ llm: LLMProvider }>;

// OpenAI adapter
export { createOpenAI } from "./openai";
export type { OpenAIAdapterConfig, OpenAIClientLike } from "./openai";

// Anthropic adapter
export { createAnthropic } from "./anthropic";
export type { AnthropicAdapterConfig, AnthropicClientLike } from "./anthropic";

// Extract structured data from LLM responses
export { extract } from "./extract";
export type { ExtractError, ExtractErrorCode, ExtractResult } from "./extract";

// Extraction step shorthand
export { defineExtractionStep } from "./extraction-step";

// Internal hash utility for testing/debugging. API may change.
export { hashValue } from "./hash";

/**
 * Create an audit event from an LLM response.
 *
 * Every LLM call should be logged via audit events (Invariant #8).
 * This helper ensures the trace is properly attached.
 *
 * @example
 * const response = await llm.complete(request);
 * if (response.ok) {
 *   events.push(llmEvent("extraction_complete", response.value));
 * }
 */
export function llmEvent(
  type: string,
  response: LLMResponse,
  payload?: Record<string, unknown>,
): AuditEvent {
  return {
    type,
    payload,
    llmTrace: response.trace,
  };
}
