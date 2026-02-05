// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "bun:test";
import type { Result } from "verist";
import { err, ok } from "verist";
import { z } from "zod";
import { extract } from "./extract";
import type { LLMError, LLMProvider, LLMResponse } from "./types";

/** Create a mock LLM provider that returns the given content. */
function mockProvider(content: string): LLMProvider {
  return {
    complete: async () =>
      ok({
        content,
        trace: {
          model: "test",
          promptTokens: 10,
          completionTokens: 20,
          durationMs: 100,
          inputHash: "sha256:input",
          outputHash: "sha256:output",
        },
      } satisfies LLMResponse),
  };
}

/** Create a mock provider that returns an error. */
function failingProvider(error: LLMError): LLMProvider {
  return {
    complete: async (): Promise<Result<LLMResponse, LLMError>> => err(error),
  };
}

const schema = z.object({ name: z.string(), score: z.number() });

describe("extract", () => {
  it("parses valid JSON response", async () => {
    const llm = mockProvider('{"name": "Acme", "score": 42}');
    const result = await extract(
      llm,
      { model: "test", messages: [{ role: "user", content: "extract" }] },
      schema,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data).toEqual({ name: "Acme", score: 42 });
      expect(result.value.response.trace.model).toBe("test");
    }
  });

  it("strips JSON fences from response", async () => {
    const llm = mockProvider('```json\n{"name": "Fenced", "score": 99}\n```');
    const result = await extract(
      llm,
      { model: "test", messages: [{ role: "user", content: "extract" }] },
      schema,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data).toEqual({ name: "Fenced", score: 99 });
    }
  });

  it("returns json_error for invalid JSON", async () => {
    const llm = mockProvider("not json at all");
    const result = await extract(
      llm,
      { model: "test", messages: [{ role: "user", content: "extract" }] },
      schema,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("json_error");
      expect(result.error.message).toContain("JSON.parse failed");
      expect(result.error.retryable).toBe(true);
    }
  });

  it("returns schema_error for schema validation failure", async () => {
    const llm = mockProvider('{"name": "Acme", "score": "not a number"}');
    const result = await extract(
      llm,
      { model: "test", messages: [{ role: "user", content: "extract" }] },
      schema,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema_error");
      expect(result.error.message).toContain("Schema validation failed");
      expect(result.error.retryable).toBe(true);
    }
  });

  it("forwards LLM provider errors", async () => {
    const llm = failingProvider({
      code: "rate_limit",
      message: "Too many requests",
      retryable: true,
    });
    const result = await extract(
      llm,
      { model: "test", messages: [{ role: "user", content: "extract" }] },
      schema,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limit");
      expect(result.error.retryable).toBe(true);
    }
  });

  it("works with generic { parse } interface (no Zod dependency)", async () => {
    const customSchema = {
      parse(value: unknown): { label: string } {
        const obj = value as Record<string, unknown>;
        if (typeof obj.label !== "string") throw new Error("Expected label");
        return { label: obj.label };
      },
    };

    const llm = mockProvider('{"label": "custom"}');
    const result = await extract(
      llm,
      { model: "test", messages: [{ role: "user", content: "extract" }] },
      customSchema,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data).toEqual({ label: "custom" });
    }
  });

  it("passes opts through to complete()", async () => {
    let receivedOpts: unknown;
    const llm: LLMProvider = {
      complete: async (_req, opts) => {
        receivedOpts = opts;
        return ok({
          content: '{"name": "test", "score": 1}',
          trace: {
            model: "test",
            promptTokens: 0,
            completionTokens: 0,
            durationMs: 0,
            inputHash: "sha256:x",
            outputHash: "sha256:y",
          },
        });
      },
    };

    const onArtifact = () => {};
    await extract(
      llm,
      { model: "test", messages: [{ role: "user", content: "extract" }] },
      schema,
      { onArtifact },
    );

    expect(receivedOpts).toEqual({ onArtifact });
  });
});
