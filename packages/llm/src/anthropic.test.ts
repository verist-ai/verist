// SPDX-License-Identifier: Apache-2.0

import type { Artifact } from "@verist/core";
import { describe, expect, it, mock } from "bun:test";
import { createAnthropic, type AnthropicClientLike } from "./anthropic";
import { createOpenAI, type OpenAIClientLike } from "./openai";

function createMockClient(
  response: Partial<{
    id: string;
    model: string;
    content: Array<{ type: string; text?: string }>;
    stop_reason: string | null;
    usage: { input_tokens: number; output_tokens: number };
  }>,
): AnthropicClientLike {
  return {
    messages: {
      create: mock(() =>
        Promise.resolve({
          id: response.id ?? "msg_123",
          model: response.model ?? "claude-sonnet-4-20250514",
          content: response.content ?? [{ type: "text", text: "Hello!" }],
          stop_reason: response.stop_reason ?? "end_turn",
          usage: response.usage ?? {
            input_tokens: 10,
            output_tokens: 5,
          },
        }),
      ),
    },
  };
}

function createErrorClient(error: Error): AnthropicClientLike {
  return {
    messages: {
      create: mock(() => Promise.reject(error)),
    },
  };
}

describe("createAnthropic", () => {
  it("returns content and trace on success", async () => {
    const client = createMockClient({
      model: "claude-sonnet-4-20250514",
      content: [{ type: "text", text: "Test response" }],
      usage: { input_tokens: 20, output_tokens: 10 },
    });
    const llm = createAnthropic({ client });

    const result = await llm.complete({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.content).toBe("Test response");
    expect(result.value.trace.model).toBe("claude-sonnet-4-20250514");
    expect(result.value.trace.promptTokens).toBe(20);
    expect(result.value.trace.completionTokens).toBe(10);
    expect(result.value.trace.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.value.trace.inputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.value.trace.outputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("includes raw input/output by default", async () => {
    const client = createMockClient({});
    const llm = createAnthropic({ client });

    const result = await llm.complete({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.trace.input).toBeDefined();
    expect(result.value.trace.output).toBeDefined();
  });

  it("omits raw content when includeRawIO is false", async () => {
    const client = createMockClient({});
    const llm = createAnthropic({ client, includeRawIO: false });

    const result = await llm.complete({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.trace.input).toBeUndefined();
    expect(result.value.trace.output).toBeUndefined();
    expect(result.value.trace.inputHash).toMatch(/^sha256:/);
    expect(result.value.trace.outputHash).toMatch(/^sha256:/);
  });

  it("extracts system messages into system param", async () => {
    const client = createMockClient({});
    const llm = createAnthropic({ client });

    await llm.complete({
      model: "claude-sonnet-4-20250514",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
      ],
    });

    const createFn = client.messages.create as ReturnType<typeof mock>;
    const params = createFn.mock.calls[0]![0];
    expect(params.system).toBe("You are helpful.");
    // system messages should not appear in messages array
    expect(params.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("concatenates multiple system messages", async () => {
    const client = createMockClient({});
    const llm = createAnthropic({ client });

    await llm.complete({
      model: "claude-sonnet-4-20250514",
      messages: [
        { role: "system", content: "Be helpful." },
        { role: "system", content: "Be precise." },
        { role: "user", content: "Hello" },
      ],
    });

    const createFn = client.messages.create as ReturnType<typeof mock>;
    const params = createFn.mock.calls[0]![0];
    expect(params.system).toBe("Be helpful.\n\nBe precise.");
  });

  it("defaults max_tokens to 4096", async () => {
    const client = createMockClient({});
    const llm = createAnthropic({ client });

    await llm.complete({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hello" }],
    });

    const createFn = client.messages.create as ReturnType<typeof mock>;
    const params = createFn.mock.calls[0]![0];
    expect(params.max_tokens).toBe(4096);
  });

  it("passes maxTokens and temperature to API", async () => {
    const client = createMockClient({});
    const llm = createAnthropic({ client });

    await llm.complete({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.7,
      maxTokens: 100,
    });

    const createFn = client.messages.create as ReturnType<typeof mock>;
    const params = createFn.mock.calls[0]![0];
    expect(params.temperature).toBe(0.7);
    expect(params.max_tokens).toBe(100);
  });

  it("ignores responseFormat without error", async () => {
    const client = createMockClient({
      content: [{ type: "text", text: '{"key": "value"}' }],
    });
    const llm = createAnthropic({ client });

    const result = await llm.complete({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Return JSON" }],
      responseFormat: "json",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.content).toBe('{"key": "value"}');
  });

  it("maps end_turn to stop finish reason", async () => {
    const client = createMockClient({ stop_reason: "end_turn" });
    const llm = createAnthropic({ client });

    const artifacts: Artifact[] = [];
    const result = await llm.complete(
      {
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
      },
      { onArtifact: (a) => artifacts.push(a) },
    );

    expect(result.ok).toBe(true);
    const output = artifacts.find((a) => a.kind === "llm-output")!;
    expect((output.content as { finishReason: string }).finishReason).toBe(
      "stop",
    );
  });

  it("maps max_tokens to length finish reason", async () => {
    const client = createMockClient({ stop_reason: "max_tokens" });
    const llm = createAnthropic({ client });

    const artifacts: Artifact[] = [];
    await llm.complete(
      {
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
      },
      { onArtifact: (a) => artifacts.push(a) },
    );

    const output = artifacts.find((a) => a.kind === "llm-output")!;
    expect((output.content as { finishReason: string }).finishReason).toBe(
      "length",
    );
  });

  it("maps 429 to rate_limit error", async () => {
    const error = Object.assign(new Error("Rate limited"), { status: 429 });
    const client = createErrorClient(error);
    const llm = createAnthropic({ client });

    const result = await llm.complete({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("rate_limit");
    expect(result.error.retryable).toBe(true);
  });

  it("maps 401 to invalid_request error", async () => {
    const error = Object.assign(new Error("Invalid API key"), { status: 401 });
    const client = createErrorClient(error);
    const llm = createAnthropic({ client });

    const result = await llm.complete({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_request");
    expect(result.error.retryable).toBe(false);
  });

  it("maps 529 (overloaded) to retryable provider_error", async () => {
    const error = Object.assign(new Error("Overloaded"), { status: 529 });
    const client = createErrorClient(error);
    const llm = createAnthropic({ client });

    const result = await llm.complete({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("provider_error");
    expect(result.error.retryable).toBe(true);
  });

  it("maps network errors to retryable provider_error", async () => {
    const client = createErrorClient(new Error("ECONNRESET"));
    const llm = createAnthropic({ client });

    const result = await llm.complete({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("provider_error");
    expect(result.error.retryable).toBe(true);
  });

  it("returns error when response contains tool_use blocks", async () => {
    const client = createMockClient({
      content: [{ type: "tool_use" }],
    });
    const llm = createAnthropic({ client });

    const result = await llm.complete({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("provider_error");
    expect(result.error.message).toContain("tool_use");
    expect(result.error.retryable).toBe(false);
  });

  it("returns error when response mixes text and tool_use blocks", async () => {
    const client = createMockClient({
      content: [
        { type: "text", text: "Here is the data" },
        { type: "tool_use" },
      ],
    });
    const llm = createAnthropic({ client });

    const result = await llm.complete({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("provider_error");
    expect(result.error.message).toContain("tool_use");
  });

  it("emits llm-input before llm-output when onArtifact provided", async () => {
    const client = createMockClient({});
    const llm = createAnthropic({ client });

    const artifacts: Artifact[] = [];
    const result = await llm.complete(
      {
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
      },
      { onArtifact: (a) => artifacts.push(a) },
    );

    expect(result.ok).toBe(true);
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]!.kind).toBe("llm-input");
    expect(artifacts[1]!.kind).toBe("llm-output");
  });

  it("artifact hashes match trace hashes", async () => {
    const client = createMockClient({});
    const llm = createAnthropic({ client });

    const artifacts: Artifact[] = [];
    const result = await llm.complete(
      {
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
      },
      { onArtifact: (a) => artifacts.push(a) },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(artifacts.find((a) => a.kind === "llm-input")!.hash).toBe(
      result.value.trace.inputHash,
    );
    expect(artifacts.find((a) => a.kind === "llm-output")!.hash).toBe(
      result.value.trace.outputHash,
    );
  });

  it("returns callback_error when onArtifact throws", async () => {
    const client = createMockClient({});
    const llm = createAnthropic({ client });

    const result = await llm.complete(
      {
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
      },
      {
        onArtifact: () => {
          throw new Error("storage full");
        },
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("callback_error");
    expect(result.error.message).toContain("storage full");
    expect(result.error.retryable).toBe(false);
  });

  it("cross-provider hash equivalence: same content → identical outputHash", async () => {
    // Mock Anthropic: returns "Same content" with end_turn
    const anthropicClient = createMockClient({
      model: "same-model",
      content: [{ type: "text", text: "Same content" }],
      stop_reason: "end_turn",
    });
    const anthropicLlm = createAnthropic({ client: anthropicClient });

    // Mock OpenAI: returns "Same content" with stop
    const openaiClient: OpenAIClientLike = {
      chat: {
        completions: {
          create: mock(() =>
            Promise.resolve({
              id: "chatcmpl-123",
              model: "same-model",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "Same content" },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
              },
            }),
          ),
        },
      },
    };
    const openaiLlm = createOpenAI({ client: openaiClient });

    const anthropicResult = await anthropicLlm.complete({
      model: "same-model",
      messages: [{ role: "user", content: "Hello" }],
    });
    const openaiResult = await openaiLlm.complete({
      model: "same-model",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(anthropicResult.ok && openaiResult.ok).toBe(true);
    if (!anthropicResult.ok || !openaiResult.ok) return;

    // Both normalize to { model: "same-model", content: "Same content", finishReason: "stop" }
    expect(anthropicResult.value.trace.outputHash).toBe(
      openaiResult.value.trace.outputHash,
    );
  });
});
