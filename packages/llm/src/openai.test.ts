// SPDX-License-Identifier: Apache-2.0

import type { Artifact } from "@verist/core";
import { describe, expect, it, mock } from "bun:test";
import { createOpenAI, type OpenAIClientLike } from "./openai";

function createMockClient(
  response: Partial<{
    id: string;
    model: string;
    choices: Array<{
      index: number;
      message: { role: string; content: string | null };
      finish_reason: string | null;
    }>;
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  }>,
): OpenAIClientLike {
  return {
    chat: {
      completions: {
        create: mock(() =>
          Promise.resolve({
            id: response.id ?? "chatcmpl-123",
            model: response.model ?? "gpt-4o",
            choices: response.choices ?? [
              {
                index: 0,
                message: { role: "assistant", content: "Hello!" },
                finish_reason: "stop",
              },
            ],
            usage: response.usage ?? {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          }),
        ),
      },
    },
  };
}

function createErrorClient(error: Error): OpenAIClientLike {
  return {
    chat: {
      completions: {
        create: mock(() => Promise.reject(error)),
      },
    },
  };
}

describe("createOpenAI", () => {
  it("returns content and trace on success", async () => {
    const client = createMockClient({
      model: "gpt-4o-2024-01-01",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Test response" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    });
    const llm = createOpenAI({ client });

    const result = await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.content).toBe("Test response");
    expect(result.value.trace.model).toBe("gpt-4o-2024-01-01");
    expect(result.value.trace.promptTokens).toBe(20);
    expect(result.value.trace.completionTokens).toBe(10);
    expect(result.value.trace.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.value.trace.inputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.value.trace.outputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("includes raw input/output by default", async () => {
    const client = createMockClient({});
    const llm = createOpenAI({ client });

    const result = await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.trace.input).toBeDefined();
    expect(result.value.trace.output).toBeDefined();
  });

  it("omits raw content when includeRawIO is false", async () => {
    const client = createMockClient({});
    const llm = createOpenAI({ client, includeRawIO: false });

    const result = await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.trace.input).toBeUndefined();
    expect(result.value.trace.output).toBeUndefined();
    // Hashes are still present
    expect(result.value.trace.inputHash).toMatch(/^sha256:/);
    expect(result.value.trace.outputHash).toMatch(/^sha256:/);
  });

  it("passes temperature and maxTokens to API", async () => {
    const client = createMockClient({});
    const llm = createOpenAI({ client });

    await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.7,
      maxTokens: 100,
    });

    const createFn = client.chat.completions.create as ReturnType<typeof mock>;
    expect(createFn).toHaveBeenCalledTimes(1);
    const params = createFn.mock.calls[0]![0];
    expect(params.temperature).toBe(0.7);
    expect(params.max_tokens).toBe(100);
  });

  it("passes response_format when responseFormat is json", async () => {
    const client = createMockClient({});
    const llm = createOpenAI({ client });

    await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Return JSON" }],
      responseFormat: "json",
    });

    const createFn = client.chat.completions.create as ReturnType<typeof mock>;
    const params = createFn.mock.calls[0]![0];
    expect(params.response_format).toEqual({ type: "json_object" });
  });

  it("omits response_format when responseFormat is not set", async () => {
    const client = createMockClient({});
    const llm = createOpenAI({ client });

    await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    const createFn = client.chat.completions.create as ReturnType<typeof mock>;
    const params = createFn.mock.calls[0]![0];
    expect(params.response_format).toBeUndefined();
  });

  it("responseFormat changes inputHash", async () => {
    const client = createMockClient({});
    const llm = createOpenAI({ client });

    const messages = [{ role: "user" as const, content: "Hello" }];
    const without = await llm.complete({ model: "gpt-4o", messages });
    const with_ = await llm.complete({
      model: "gpt-4o",
      messages,
      responseFormat: "json",
    });

    expect(without.ok && with_.ok).toBe(true);
    if (!without.ok || !with_.ok) return;

    expect(without.value.trace.inputHash).not.toBe(with_.value.trace.inputHash);
  });

  it("handles null content in response", async () => {
    const client = createMockClient({
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: null },
          finish_reason: "stop",
        },
      ],
    });
    const llm = createOpenAI({ client });

    const result = await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.content).toBe("");
  });

  it("returns provider_error when no choices returned", async () => {
    const client = createMockClient({ choices: [] });
    const llm = createOpenAI({ client });

    const result = await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("provider_error");
    expect(result.error.message).toBe("OpenAI returned no choices");
    expect(result.error.retryable).toBe(true);
  });

  it("maps 429 to rate_limit error", async () => {
    const error = Object.assign(new Error("Rate limit exceeded"), {
      status: 429,
    });
    const client = createErrorClient(error);
    const llm = createOpenAI({ client });

    const result = await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("rate_limit");
    expect(result.error.retryable).toBe(true);
  });

  it("maps context_length_exceeded to context_length error", async () => {
    const error = Object.assign(new Error("Context too long"), {
      code: "context_length_exceeded",
      status: 400,
    });
    const client = createErrorClient(error);
    const llm = createOpenAI({ client });

    const result = await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("context_length");
    expect(result.error.retryable).toBe(false);
  });

  it("maps 401/403 to non-retryable invalid_request", async () => {
    for (const status of [401, 403]) {
      const error = Object.assign(new Error("Unauthorized"), { status });
      const client = createErrorClient(error);
      const llm = createOpenAI({ client });

      const result = await llm.complete({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe("invalid_request");
      expect(result.error.retryable).toBe(false);
    }
  });

  it("maps 4xx to invalid_request error", async () => {
    const error = Object.assign(new Error("Bad request"), { status: 400 });
    const client = createErrorClient(error);
    const llm = createOpenAI({ client });

    const result = await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("invalid_request");
    expect(result.error.retryable).toBe(false);
  });

  it("maps 5xx to retryable provider_error", async () => {
    const error = Object.assign(new Error("Internal error"), { status: 500 });
    const client = createErrorClient(error);
    const llm = createOpenAI({ client });

    const result = await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("provider_error");
    expect(result.error.retryable).toBe(true);
  });

  it("maps network errors (no status) to retryable provider_error", async () => {
    const client = createErrorClient(new Error("ECONNRESET"));
    const llm = createOpenAI({ client });

    const result = await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("provider_error");
    expect(result.error.retryable).toBe(true);
  });

  it("produces consistent inputHash for identical requests", async () => {
    const client = createMockClient({});
    const llm = createOpenAI({ client });

    const request = {
      model: "gpt-4o",
      messages: [{ role: "user" as const, content: "Hello" }],
    };

    const result1 = await llm.complete(request);
    const result2 = await llm.complete(request);

    expect(result1.ok && result2.ok).toBe(true);
    if (!result1.ok || !result2.ok) return;

    expect(result1.value.trace.inputHash).toBe(result2.value.trace.inputHash);
  });

  it("produces consistent outputHash for same semantic content", async () => {
    // Mock returns different ids but same semantic content
    let callCount = 0;
    const client: OpenAIClientLike = {
      chat: {
        completions: {
          create: mock(() => {
            callCount++;
            return Promise.resolve({
              id: `chatcmpl-${callCount}`, // Different id each time
              model: "gpt-4o",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "Same response" },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
              },
            });
          }),
        },
      },
    };
    const llm = createOpenAI({ client });

    const result1 = await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });
    const result2 = await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result1.ok && result2.ok).toBe(true);
    if (!result1.ok || !result2.ok) return;

    // outputHash should be stable despite different completion ids
    expect(result1.value.trace.outputHash).toBe(result2.value.trace.outputHash);
  });

  it("emits llm-input before llm-output when onArtifact provided", async () => {
    const client = createMockClient({
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Response" },
          finish_reason: "stop",
        },
      ],
    });
    const llm = createOpenAI({ client });

    const artifacts: Artifact[] = [];
    const result = await llm.complete(
      { model: "gpt-4o", messages: [{ role: "user", content: "Hello" }] },
      { onArtifact: (a) => artifacts.push(a) },
    );

    expect(result.ok).toBe(true);
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]!.kind).toBe("llm-input");
    expect(artifacts[1]!.kind).toBe("llm-output");
  });

  it("artifact content matches normalized objects used for hashing", async () => {
    const client = createMockClient({
      model: "gpt-4o-2024-01-01",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Test" },
          finish_reason: "stop",
        },
      ],
    });
    const llm = createOpenAI({ client });

    const artifacts: Artifact[] = [];
    const result = await llm.complete(
      { model: "gpt-4o", messages: [{ role: "user", content: "Hello" }] },
      { onArtifact: (a) => artifacts.push(a) },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const inputArtifact = artifacts.find((a) => a.kind === "llm-input")!;
    const outputArtifact = artifacts.find((a) => a.kind === "llm-output")!;

    // Input content is the OpenAI request params
    expect(inputArtifact.content).toEqual({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    // Output content is the normalized { model, content, finishReason }
    expect(outputArtifact.content).toEqual({
      model: "gpt-4o-2024-01-01",
      content: "Test",
      finishReason: "stop",
    });
  });

  it("artifact hashes match trace hashes", async () => {
    const client = createMockClient({});
    const llm = createOpenAI({ client });

    const artifacts: Artifact[] = [];
    const result = await llm.complete(
      { model: "gpt-4o", messages: [{ role: "user", content: "Hello" }] },
      { onArtifact: (a) => artifacts.push(a) },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const inputArtifact = artifacts.find((a) => a.kind === "llm-input")!;
    const outputArtifact = artifacts.find((a) => a.kind === "llm-output")!;

    expect(inputArtifact.hash).toBe(result.value.trace.inputHash);
    expect(outputArtifact.hash).toBe(result.value.trace.outputHash);
  });

  it("same request + same response produces identical artifact hashes", async () => {
    const client = createMockClient({});
    const llm = createOpenAI({ client });

    const request = {
      model: "gpt-4o",
      messages: [{ role: "user" as const, content: "Hello" }],
    };

    const artifacts1: Artifact[] = [];
    const artifacts2: Artifact[] = [];
    await llm.complete(request, { onArtifact: (a) => artifacts1.push(a) });
    await llm.complete(request, { onArtifact: (a) => artifacts2.push(a) });

    expect(artifacts1[0]!.hash).toBe(artifacts2[0]!.hash);
    expect(artifacts1[1]!.hash).toBe(artifacts2[1]!.hash);
  });

  it("returns callback_error when onArtifact throws", async () => {
    const client = createMockClient({});
    const llm = createOpenAI({ client });

    const result = await llm.complete(
      { model: "gpt-4o", messages: [{ role: "user", content: "Hello" }] },
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

  it("no artifacts emitted when onArtifact is not provided", async () => {
    const client = createMockClient({});
    const llm = createOpenAI({ client });

    // No opts at all
    const result1 = await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(result1.ok).toBe(true);

    // Opts without onArtifact
    const result2 = await llm.complete(
      { model: "gpt-4o", messages: [{ role: "user", content: "Hello" }] },
      {},
    );
    expect(result2.ok).toBe(true);
    // If we got here without error, no artifacts were emitted (no callback to call)
  });

  it("includeRawIO:false still emits artifacts with content", async () => {
    const client = createMockClient({});
    const llm = createOpenAI({ client, includeRawIO: false });

    const artifacts: Artifact[] = [];
    const result = await llm.complete(
      { model: "gpt-4o", messages: [{ role: "user", content: "Hello" }] },
      { onArtifact: (a) => artifacts.push(a) },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Trace omits raw IO
    expect(result.value.trace.input).toBeUndefined();
    expect(result.value.trace.output).toBeUndefined();

    // Artifacts still emitted with content
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]!.content).toBeDefined();
    expect(artifacts[1]!.content).toBeDefined();
  });

  it("produces different outputHash for different content", async () => {
    let callCount = 0;
    const client: OpenAIClientLike = {
      chat: {
        completions: {
          create: mock(() => {
            callCount++;
            return Promise.resolve({
              id: "chatcmpl-123",
              model: "gpt-4o",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: `Response ${callCount}`,
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
              },
            });
          }),
        },
      },
    };
    const llm = createOpenAI({ client });

    const result1 = await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });
    const result2 = await llm.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result1.ok && result2.ok).toBe(true);
    if (!result1.ok || !result2.ok) return;

    expect(result1.value.trace.outputHash).not.toBe(
      result2.value.trace.outputHash,
    );
  });
});
