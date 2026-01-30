import type { Result, LLMTrace, AuditEvent } from "@verist/core";

// Re-export LLMTrace from core for convenience
export type { LLMTrace } from "@verist/core";

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
 * Request payload for LLM completion.
 */
export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * Chat message format for LLM requests.
 */
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Response from LLM completion.
 */
export interface LLMResponse {
  content: string;
  trace: LLMTrace;
}

/**
 * Error codes for LLM provider failures.
 */
export type LLMErrorCode =
  | "rate_limit"
  | "context_length"
  | "invalid_request"
  | "provider_error";

/**
 * Structured error for LLM operations.
 */
export interface LLMError {
  code: LLMErrorCode;
  message: string;
  retryable: boolean;
}

/**
 * LLM provider adapter interface.
 * Implementations wrap specific provider SDKs (OpenAI, Anthropic, etc.)
 */
export interface LLMProvider {
  /**
   * Execute a completion request.
   */
  complete(request: LLMRequest): Promise<Result<LLMResponse, LLMError>>;
}

/**
 * Configuration for OpenAI provider.
 */
export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
}

/**
 * Create an OpenAI provider adapter.
 * @placeholder Implementation pending
 */
export function createOpenAI(_config: OpenAIConfig): LLMProvider {
  throw new Error("@verist/llm: OpenAI adapter not yet implemented");
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
