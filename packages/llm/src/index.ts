// SPDX-License-Identifier: Apache-2.0

import type { AuditEvent } from "@verist/core";
import type { LLMResponse } from "./types";

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

// OpenAI adapter
export { createOpenAI } from "./openai";
export type { OpenAIAdapterConfig, OpenAIClientLike } from "./openai";

// Anthropic adapter
export { createAnthropic } from "./anthropic";
export type { AnthropicAdapterConfig, AnthropicClientLike } from "./anthropic";

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
