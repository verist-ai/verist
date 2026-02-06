/**
 * Prompt Diff Quickstart
 *
 * You changed a prompt. What broke?
 *
 * This example shows how Verist detects regressions when you modify
 * an AI prompt. Run a baseline, capture it, recompute with a new prompt,
 * and see exactly what changed — in under 60 seconds.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... bun examples/prompt-diff/quickstart.ts
 */

import type { LLMProvider } from "@verist/llm";
import { createOpenAI, defineExtractionStep } from "@verist/llm";
import OpenAI from "openai";
import { formatDiff, recompute, run, unwrap } from "verist";
import { z } from "zod";

type Adapters = { llm: LLMProvider };

// --- Prompts: baseline vs regression ---

const BASELINE_PROMPT = `Extract specific, verifiable claims from the text.
Each claim must contain a concrete number, name, or date.
Return raw JSON only, no markdown: { "claims": ["claim1", "claim2", ...] }`;

const REGRESSION_PROMPT = `Summarize the key points from the text. Be concise.
Return raw JSON only, no markdown: { "claims": ["point1", "point2", ...] }`;

// --- Sample input and schema ---

const SAMPLE_TEXT = `Acme Corp reported $4.2M in Q3 revenue, up 18% year-over-year.
CEO Jane Park announced 3 new enterprise clients and plans to expand
the engineering team from 45 to 60 people by March 2025.`;

const ClaimsSchema = z.object({
  claims: z.array(z.string()),
});

// --- Main: run → capture → recompute → diff ---

async function main() {
  const adapters: Adapters = { llm: createOpenAI({ client: new OpenAI() }) };

  // 1. Run baseline
  print("Running baseline extraction...");
  const baselineStep = extractStep(BASELINE_PROMPT);
  const baselineResult = unwrap(
    await run(baselineStep, { text: SAMPLE_TEXT }, { adapters }),
  );
  const baselineClaims = baselineResult.output.claims!;
  print(`Baseline: ${baselineClaims.length} claims`, "done");
  for (const claim of baselineClaims) console.log(`  • ${claim}`);

  // 2. Recompute with regression prompt
  print("Recomputing with new prompt...");
  const regressionStep = extractStep(REGRESSION_PROMPT);
  const recomputeResult = unwrap(
    await recompute(baselineResult, regressionStep, { adapters }),
  );
  const newClaims = recomputeResult.parsedOutput?.claims ?? [];
  print(`Recompute: ${newClaims.length} claims`, "done");
  for (const claim of newClaims) console.log(`  • ${claim}`);

  // 4. Show diff
  console.log("\n--- Diff ---");
  const diffResult = recomputeResult.outputDiff;
  console.log(
    !diffResult || diffResult.equal ? "No changes." : formatDiff(diffResult),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// --- Implementation details ---

function extractStep(systemPrompt: string) {
  return defineExtractionStep({
    name: "extract-claims",
    input: z.object({ text: z.string() }),
    output: ClaimsSchema,
    request: (input) => ({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: input.text },
      ],
      responseFormat: "json",
    }),
  });
}

function print(label: string, status?: "done") {
  const prefix = status === "done" ? "✓" : "○";
  console.log(`${prefix} ${label}`);
}
