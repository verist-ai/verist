import type { Result, LLMTrace } from "@verist/core";

// Re-export LLMTrace from core for convenience
export type { LLMTrace } from "@verist/core";

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
 *
 * Invariant: LLMTrace is produced only for successful completions.
 * Errors do not include trace metadata (no duration, hashes, etc.).
 */
export interface LLMProvider {
  /**
   * Execute a completion request.
   */
  complete(request: LLMRequest): Promise<Result<LLMResponse, LLMError>>;
}
