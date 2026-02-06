// SPDX-License-Identifier: Apache-2.0

import type { Step } from "verist";
import { defineStep, fail } from "verist";
import type { z } from "zod";
import { extract } from "./extract";
import type { LLMContext } from "./index";
import type { LLMProvider, LLMRequest } from "./types";

/**
 * Define an extraction step — the common case where a step builds an LLM
 * request from input, extracts structured data, and returns it as output.
 *
 * Equivalent to writing `defineStep` + `extract` + `fail` + `return { output }`
 * by hand. Use `defineStep` directly when you need custom logic (pre/post-processing,
 * multiple LLM calls, conditional extraction).
 *
 * @example
 * ```typescript
 * const extractJob = defineExtractionStep({
 *   name: "extract-job",
 *   input: z.object({ text: z.string() }),
 *   output: z.object({ title: z.string(), salary: z.number() }),
 *   request: (input) => ({
 *     model: "gpt-4o",
 *     messages: [{ role: "user", content: `Extract from: ${input.text}` }],
 *     responseFormat: "json",
 *   }),
 * });
 * ```
 */
export function defineExtractionStep<TInput, TOutput extends object>(config: {
  name: string;
  input: z.ZodType<TInput>;
  output: z.ZodType<TOutput>;
  request: (input: TInput) => LLMRequest;
}): Step<TInput, TOutput, { llm: LLMProvider }> {
  return defineStep({
    name: config.name,
    input: config.input,
    output: config.output,
    run: async (input: TInput, ctx: LLMContext) => {
      const result = await extract(ctx, config.request(input), config.output);
      if (!result.ok) return fail(result.error);
      return { output: result.value.data as Partial<TOutput> };
    },
  });
}
