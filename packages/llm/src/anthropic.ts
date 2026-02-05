// SPDX-License-Identifier: Apache-2.0

import type { Artifact } from "verist";
import { err, ok } from "verist";
import { hashValue } from "./hash";
import type {
  LLMCompleteOpts,
  LLMError,
  LLMProvider,
  LLMRequest,
} from "./types";

/**
 * Anthropic message create parameters (subset used by the adapter).
 */
interface AnthropicCreateParams {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  temperature?: number;
}

/**
 * Anthropic message response.
 */
interface AnthropicMessage {
  id: string;
  model: string;
  content: Array<{ type: string; text?: string }>;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Structural type for Anthropic client.
 * User brings their own `@anthropic-ai/sdk` instance.
 *
 * Uses `(params: any)` because Anthropic SDK's overloaded `create`
 * method is not assignable to a single-signature interface.
 */
// deno-lint-ignore no-explicit-any
export interface AnthropicClientLike {
  messages: {
    create(params: any): Promise<AnthropicMessage>;
  };
}

/**
 * Configuration for Anthropic adapter.
 */
export interface AnthropicAdapterConfig {
  /** Anthropic client instance (user-provided) */
  client: AnthropicClientLike;
  /**
   * Include raw provider request/response in trace (unredacted).
   * Set to false for compliance environments that cannot store prompts.
   * @default true
   */
  includeRawIO?: boolean;
}

/**
 * Map Anthropic stop_reason to normalized finish reason.
 * end_turn/stop_sequence → "stop", max_tokens → "length"
 */
function normalizeStopReason(reason: string | null): string {
  if (reason === "end_turn" || reason === "stop_sequence") return "stop";
  if (reason === "max_tokens") return "length";
  return reason ?? "unknown";
}

/**
 * Map Anthropic SDK errors to structured LLMError.
 */
function mapAnthropicError(error: unknown): LLMError {
  const status = (error as { status?: number }).status;
  const message =
    error instanceof Error ? error.message : "Unknown Anthropic error";

  if (status === 429) {
    return { code: "rate_limit", message, retryable: true };
  }

  if (status === 401 || status === 403) {
    return { code: "invalid_request", message, retryable: false };
  }

  if (status !== undefined && status >= 400 && status < 500) {
    return { code: "invalid_request", message, retryable: false };
  }

  // 529 = overloaded (Anthropic-specific)
  if (status === 529 || (status !== undefined && status >= 500)) {
    return { code: "provider_error", message, retryable: true };
  }

  // Network errors (no status)
  return { code: "provider_error", message, retryable: true };
}

/**
 * Create an Anthropic provider adapter.
 *
 * Note: Anthropic requires messages to alternate between user and assistant roles.
 * Consecutive same-role messages (valid in OpenAI) will cause a 400 error.
 * Merge consecutive user messages before calling this adapter.
 *
 * @example
 * import Anthropic from "@anthropic-ai/sdk";
 * import { createAnthropic } from "@verist/llm";
 *
 * const llm = createAnthropic({
 *   client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
 * });
 *
 * const result = await llm.complete({
 *   model: "claude-sonnet-4-20250514",
 *   messages: [{ role: "user", content: "Extract claims..." }],
 * });
 */
export function createAnthropic(config: AnthropicAdapterConfig): LLMProvider {
  const { client, includeRawIO = true } = config;

  return {
    async complete(request: LLMRequest, opts?: LLMCompleteOpts) {
      // Extract system messages → Anthropic system param, rest → messages
      const systemMessages = request.messages.filter(
        (m) => m.role === "system",
      );
      const nonSystemMessages = request.messages.filter(
        (m) => m.role !== "system",
      );

      const system =
        systemMessages.length > 0
          ? systemMessages.map((m) => m.content).join("\n\n")
          : undefined;

      const params: AnthropicCreateParams = {
        model: request.model,
        max_tokens: request.maxTokens ?? 4096,
        messages: nonSystemMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        ...(system !== undefined && { system }),
        ...(request.temperature !== undefined && {
          temperature: request.temperature,
        }),
      };

      const startTime = performance.now();

      let message;
      try {
        message = await client.messages.create(params);
      } catch (error) {
        return err(mapAnthropicError(error));
      }

      const durationMs = performance.now() - startTime;

      // LLMProvider is a text-only interface. If the model returns tool_use blocks,
      // the user likely sent tools to the wrong adapter — fail explicitly rather than
      // silently discarding the tool invocations.
      if (message.content.some((block) => block.type === "tool_use")) {
        return err({
          code: "provider_error",
          message:
            "Anthropic returned tool_use blocks. " +
            "LLMProvider supports text completions only.",
          retryable: false,
        });
      }

      const content = message.content
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text!)
        .join("");

      const finishReason = normalizeStopReason(message.stop_reason);

      // outputHash: normalized shape identical to OpenAI adapter — enables cross-provider comparison.
      // inputHash: provider-specific params (Anthropic wire format). Switching providers changes
      // input hashes even for logically equivalent prompts. This is intentional — the audit trail
      // records what was actually sent to the provider.
      const normalizedOutput = {
        model: message.model,
        content,
        finishReason,
      };

      const [inputHash, outputHash] = await Promise.all([
        hashValue(params),
        hashValue(normalizedOutput),
      ]);

      // Emit artifacts when callback is provided (input before output)
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
          model: message.model,
          promptTokens: message.usage.input_tokens,
          completionTokens: message.usage.output_tokens,
          durationMs,
          inputHash,
          outputHash,
          ...(includeRawIO && { input: params, output: message }),
        },
      });
    },
  };
}
