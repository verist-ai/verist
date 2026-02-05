// SPDX-License-Identifier: Apache-2.0

import type { LLMTrace, OnArtifact, Result } from "verist";

// Re-export LLMTrace from core for convenience
export type { LLMTrace } from "verist";

/**
 * Request payload for LLM completion.
 */
export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Request JSON output. Maps to provider-specific JSON mode (e.g. OpenAI response_format). */
  responseFormat?: "json";
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
  | "provider_error"
  | "callback_error";

/**
 * Structured error for LLM operations.
 */
export interface LLMError {
  code: LLMErrorCode;
  message: string;
  retryable: boolean;
}

/**
 * Options for LLM completion calls.
 */
export interface LLMCompleteOpts {
  /**
   * Callback for emitting artifacts (llm-input, llm-output).
   * Called synchronously on success, before the result is returned.
   * Not called on provider errors. Input is emitted before output.
   * If the callback throws, the call returns `callback_error` (not a provider error).
   */
  onArtifact?: OnArtifact;
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
  complete(
    request: LLMRequest,
    opts?: LLMCompleteOpts,
  ): Promise<Result<LLMResponse, LLMError>>;
}
