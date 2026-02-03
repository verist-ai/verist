// SPDX-License-Identifier: Apache-2.0

import type { Artifact } from "@verist/core";
import { err, ok } from "@verist/core";
import { hashValue } from "./hash";
import type {
  LLMCompleteOpts,
  LLMError,
  LLMProvider,
  LLMRequest,
} from "./types";

/**
 * OpenAI chat completion message format.
 * Structural typing - no openai package dependency.
 */
interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string | null;
}

/**
 * OpenAI chat completion request parameters.
 */
interface OpenAICreateParams {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
}

/**
 * OpenAI chat completion response.
 */
interface OpenAIChatCompletion {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Structural type for OpenAI client.
 * User brings their own openai package instance.
 *
 * Uses `(params: any) => ...` because OpenAI SDK's overloaded `create`
 * method is not assignable to a single-signature interface due to
 * TypeScript's contravariant parameter checking on overloads.
 */
// deno-lint-ignore no-explicit-any
export interface OpenAIClientLike {
  chat: {
    completions: {
      create(params: any): Promise<OpenAIChatCompletion>;
    };
  };
}

/**
 * Configuration for OpenAI adapter.
 */
export interface OpenAIAdapterConfig {
  /** OpenAI client instance (user-provided) */
  client: OpenAIClientLike;
  /**
   * Include raw provider request/response in trace (unredacted).
   * Set to false for compliance environments that cannot store prompts.
   * Note: This is trace embedding, not artifact storage.
   * @default true
   */
  includeRawIO?: boolean;
}

/**
 * Map OpenAI SDK errors to structured LLMError.
 * Note: OpenAI returns semantic errors via error.code even when status is
 * generic (e.g. 400), so code checks must come before status checks.
 */
function mapOpenAIError(error: unknown): LLMError {
  const status = (error as { status?: number }).status;
  const code = (error as { code?: string }).code;
  const message =
    error instanceof Error ? error.message : "Unknown OpenAI error";

  // Rate limiting
  if (status === 429) {
    return { code: "rate_limit", message, retryable: true };
  }

  // Context length exceeded (check code before generic 4xx)
  if (code === "context_length_exceeded") {
    return { code: "context_length", message, retryable: false };
  }

  // Auth errors - not retryable
  if (status === 401 || status === 403) {
    return { code: "invalid_request", message, retryable: false };
  }

  // Other client errors (4xx)
  if (status !== undefined && status >= 400 && status < 500) {
    return { code: "invalid_request", message, retryable: false };
  }

  // Server errors (5xx) - retryable
  if (status !== undefined && status >= 500) {
    return { code: "provider_error", message, retryable: true };
  }

  // Network errors (no status) - retryable
  return { code: "provider_error", message, retryable: true };
}

/**
 * Create an OpenAI provider adapter.
 *
 * @example
 * import OpenAI from "openai";
 * import { createOpenAI } from "@verist/llm";
 *
 * const llm = createOpenAI({
 *   client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
 * });
 *
 * const result = await llm.complete({
 *   model: "gpt-4o",
 *   messages: [{ role: "user", content: "Extract claims..." }],
 * });
 */
export function createOpenAI(config: OpenAIAdapterConfig): LLMProvider {
  const { client, includeRawIO = true } = config;

  return {
    async complete(request: LLMRequest, opts?: LLMCompleteOpts) {
      const params: OpenAICreateParams = {
        model: request.model,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        ...(request.temperature !== undefined && {
          temperature: request.temperature,
        }),
        ...(request.maxTokens !== undefined && {
          max_tokens: request.maxTokens,
        }),
      };

      const startTime = performance.now();

      let completion;
      try {
        completion = await client.chat.completions.create(params);
      } catch (error) {
        return err(mapOpenAIError(error));
      }

      const durationMs = performance.now() - startTime;

      // Handle empty choices as provider error
      const choice = completion.choices[0];
      if (!choice) {
        return err({
          code: "provider_error",
          message: "OpenAI returned no choices",
          retryable: true,
        });
      }

      const content = choice.message.content ?? "";
      const promptTokens = completion.usage?.prompt_tokens ?? 0;
      const completionTokens = completion.usage?.completion_tokens ?? 0;

      // outputHash: semantic content including termination reason
      // (truncated responses differ from complete ones)
      const normalizedOutput = {
        model: completion.model,
        content,
        finishReason: choice.finish_reason,
      };

      // inputHash: provider request params (structural changes = semantic changes)
      const [inputHash, outputHash] = await Promise.all([
        hashValue(params),
        hashValue(normalizedOutput),
      ]);

      // Emit artifacts when callback is provided (input before output).
      if (opts?.onArtifact) {
        const inputArtifact: Artifact = {
          hash: inputHash,
          kind: "llm-input",
          content: params,
        };
        const outputArtifact: Artifact = {
          hash: outputHash,
          kind: "llm-output",
          content: normalizedOutput,
        };
        try {
          opts.onArtifact(inputArtifact);
          opts.onArtifact(outputArtifact);
        } catch (error) {
          return err({
            code: "callback_error",
            message: `onArtifact callback threw: ${error instanceof Error ? error.message : String(error)}`,
            retryable: false,
          });
        }
      }

      return ok({
        content,
        trace: {
          model: completion.model,
          promptTokens,
          completionTokens,
          durationMs,
          inputHash,
          outputHash,
          ...(includeRawIO && { input: params, output: completion }),
        },
      });
    },
  };
}
