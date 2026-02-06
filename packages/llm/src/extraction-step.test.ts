// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "bun:test";
import type { Result } from "verist";
import { ok, run } from "verist";
import { z } from "zod";
import { defineExtractionStep } from "./extraction-step";
import type { LLMError, LLMProvider, LLMResponse } from "./types";

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

function failingProvider(): LLMProvider {
  return {
    complete: async () =>
      ({
        ok: false,
        error: {
          code: "rate_limit" as const,
          message: "Too many requests",
          retryable: true,
        },
      }) as Result<LLMResponse, LLMError>,
  };
}

describe("defineExtractionStep", () => {
  const schema = z.object({ title: z.string(), salary: z.number() });

  const step = defineExtractionStep({
    name: "extract-job",
    input: z.object({ text: z.string() }),
    output: schema,
    request: (input) => ({
      model: "gpt-4o",
      messages: [
        { role: "user" as const, content: `Extract from: ${input.text}` },
      ],
      responseFormat: "json",
    }),
  });

  it("extracts structured data on success", async () => {
    const llm = mockProvider('{"title": "Engineer", "salary": 120000}');
    const result = await run(
      step,
      { text: "job posting" },
      { adapters: { llm } },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output).toEqual({
        title: "Engineer",
        salary: 120000,
      });
    }
  });

  it("returns structured error on LLM failure", async () => {
    const llm = failingProvider();
    const result = await run(
      step,
      { text: "job posting" },
      { adapters: { llm } },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limit");
      expect(result.error.retryable).toBe(true);
    }
  });

  it("returns structured error on invalid JSON", async () => {
    const llm = mockProvider("not json");
    const result = await run(
      step,
      { text: "job posting" },
      { adapters: { llm } },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("json_error");
      expect(result.error.retryable).toBe(true);
    }
  });

  it("returns structured error on schema mismatch", async () => {
    const llm = mockProvider('{"title": "Engineer", "salary": "not a number"}');
    const result = await run(
      step,
      { text: "job posting" },
      { adapters: { llm } },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema_error");
      expect(result.error.retryable).toBe(false);
    }
  });
});
