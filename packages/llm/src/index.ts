import type { AuditEvent } from "@verist/core";
import type { LLMProvider, LLMResponse } from "./types";

// Types
export type {
  LLMRequest,
  LLMMessage,
  LLMResponse,
  LLMErrorCode,
  LLMError,
  LLMProvider,
  LLMTrace,
} from "./types";

// OpenAI adapter
export { createOpenAI } from "./openai";
export type { OpenAIClientLike, OpenAIAdapterConfig } from "./openai";

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

/**
 * Configuration for Anthropic provider.
 */
export interface AnthropicConfig {
  apiKey: string;
  baseUrl?: string;
}

/**
 * Create an Anthropic provider adapter.
 * @placeholder Implementation pending
 */
export function createAnthropic(_config: AnthropicConfig): LLMProvider {
  throw new Error("@verist/llm: Anthropic adapter not yet implemented");
}
