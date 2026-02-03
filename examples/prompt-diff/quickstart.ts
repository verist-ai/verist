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

import { createContextFactory, defineStep, run, unwrap } from "@verist/core";
import type { LLMProvider } from "@verist/llm";
import { createOpenAI, llmEvent } from "@verist/llm";
import { capture, diff, recompute } from "@verist/replay/quickstart";
import OpenAI from "openai";
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
  const baselineClaims = baselineResult.output.delta.claims!;
  print(`Baseline: ${baselineClaims.length} claims`, "done");
  for (const claim of baselineClaims) console.log(`  • ${claim}`);

  // 2. Capture snapshot
  print("Capturing snapshot...");
  const snapshot = await capture(baselineResult);
  print("Snapshot captured", "done");

  // 3. Recompute with regression prompt
  print("Recomputing with new prompt...");
  const regressionStep = extractStep(REGRESSION_PROMPT);
  const ctx = createContextFactory(adapters)({
    workflowId: snapshot.workflowId,
    workflowVersion: snapshot.workflowVersion,
    runId: "recompute-1",
  });
  const recomputeResult = unwrap(
    await recompute(snapshot, regressionStep, ctx),
  );
  const newClaims = recomputeResult.output.delta.claims!;
  print(`Recompute: ${newClaims.length} claims`, "done");
  for (const claim of newClaims) console.log(`  • ${claim}`);

  // 4. Show diff
  console.log("\n--- Diff ---");
  console.log(diff(recomputeResult.deltaDiff));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// --- Implementation details ---

function extractStep(systemPrompt: string) {
  return defineStep({
    name: "extract-claims",
    input: z.object({ text: z.string() }),
    delta: ClaimsSchema,
    run: async (input, ctx) => {
      const { llm } = ctx.adapters as Adapters;
      const response = unwrap(
        await llm.complete({
          model: "gpt-4o-mini",
          temperature: 0,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.text },
          ],
        }),
      );

      const parsed = ClaimsSchema.parse(parseJSON(response.content));
      return {
        delta: parsed,
        events: [llmEvent("claims_extracted", response)],
      };
    },
  });
}

/** Extract JSON object from LLM response, tolerating markdown fences and surrounding text. */
function parseJSON(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new SyntaxError(
      `No JSON object found in LLM response: ${text.slice(0, 200)}`,
    );
  }
  const snippet = text.slice(start, end + 1);
  try {
    return JSON.parse(snippet);
  } catch {
    throw new SyntaxError(
      `Invalid JSON in LLM response: ${snippet.slice(0, 200)}`,
    );
  }
}

function print(label: string, status?: "done") {
  const prefix = status === "done" ? "✓" : "○";
  console.log(`${prefix} ${label}`);
}
