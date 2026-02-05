/**
 * Overlay Recompute Example
 *
 * Demonstrates Verist's three-layer state model:
 * 1. AI produces computed state (risk assessment)
 * 2. Human applies overlay (overrides risk level)
 * 3. Recompute: computed changes, effective stays fixed (overlay preserved)
 *
 * Run: bun examples/overlay-recompute/run.ts
 */

import { createMemoryStore, effectiveState } from "@verist/storage";
import { defineStep, run, unwrap } from "verist";
import { z } from "zod";

// --- Schema ---

const RiskInput = z.object({
  documentId: z.string(),
  content: z.string(),
});

const RiskOutput = z.object({
  riskLevel: z.enum(["low", "medium", "high"]),
  riskScore: z.number().min(0).max(1),
  reasoning: z.string(),
});

type RiskState = z.infer<typeof RiskOutput>;

// --- Mock LLM (intentionally non-deterministic to simulate model drift) ---

let callCount = 0;

function mockAssessRisk(content: string) {
  callCount++;
  const score = content.length > 20 ? 0.7 + callCount * 0.05 : 0.3;
  const level = score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low";
  return {
    riskLevel: level as "low" | "medium" | "high",
    riskScore: Math.round(score * 100) / 100,
    reasoning: `Assessment #${callCount}: content length ${content.length}, score ${score.toFixed(2)}`,
  };
}

// --- Step ---

const assessRisk = defineStep({
  name: "assess-risk",
  input: RiskInput,
  output: RiskOutput,
  run: async (input) => {
    const result = mockAssessRisk(input.content);
    return {
      output: result,
      events: [{ type: "risk_assessed", payload: { score: result.riskScore } }],
    };
  },
});

// --- Main ---

async function main() {
  const store = createMemoryStore();
  const workflowId = "doc-review";
  const runId = "run-001";

  // 1. Run step and commit computed state
  console.log("=== Step 1: Initial risk assessment ===\n");
  const result = unwrap(
    await run(
      assessRisk,
      {
        documentId: "doc-1",
        content:
          "This contract contains unusual liability clauses and penalties",
      },
      { adapters: {} },
    ),
  );

  unwrap(
    await store.commit({
      workflowId,
      runId,
      stepId: "assess-risk",
      expectedVersion: 0,
      output: result.output,
      events: result.events,
    }),
  );

  const snap1 = unwrap(await store.load<RiskState>(workflowId, runId));
  console.log("Computed:", snap1.computed);
  console.log("Effective:", effectiveState(snap1));

  // 2. Human overrides risk level
  console.log("\n=== Step 2: Human overrides risk to 'low' ===\n");
  unwrap(await store.setOverlay(workflowId, runId, { riskLevel: "low" }));

  const snap2 = unwrap(await store.load<RiskState>(workflowId, runId));
  console.log("Computed:", snap2.computed);
  console.log("Overlay:", snap2.overlay);
  console.log("Effective:", effectiveState(snap2));

  // 3. Recompute (new LLM output) and commit
  console.log("\n=== Step 3: Recompute (new assessment) ===\n");
  const result2 = unwrap(
    await run(
      assessRisk,
      {
        documentId: "doc-1",
        content:
          "This contract contains unusual liability clauses and penalties",
      },
      { adapters: {} },
    ),
  );

  unwrap(
    await store.commit({
      workflowId,
      runId,
      stepId: "assess-risk",
      expectedVersion: 1,
      output: result2.output,
      events: result2.events,
    }),
  );

  const snap3 = unwrap(await store.load<RiskState>(workflowId, runId));
  const eff3 = effectiveState(snap3);
  console.log("Computed:", snap3.computed);
  console.log("Overlay:", snap3.overlay);
  console.log("Effective:", eff3);
  console.log(
    `\n  -> riskLevel: "${eff3.riskLevel}" (overlay wins, computed was "${snap3.computed.riskLevel}")`,
  );

  // 4. Recompute again (overlay fields stay fixed)
  console.log("\n=== Step 4: Recompute again ===\n");
  const result3 = unwrap(
    await run(
      assessRisk,
      {
        documentId: "doc-1",
        content:
          "This contract contains unusual liability clauses and penalties",
      },
      { adapters: {} },
    ),
  );

  unwrap(
    await store.commit({
      workflowId,
      runId,
      stepId: "assess-risk",
      expectedVersion: 2,
      output: result3.output,
      events: result3.events,
    }),
  );

  const snap4 = unwrap(await store.load<RiskState>(workflowId, runId));
  const eff4 = effectiveState(snap4);
  console.log("Computed:", snap4.computed);
  console.log("Overlay:", snap4.overlay);
  console.log("Effective:", eff4);
  console.log(`\n  -> riskLevel: "${eff4.riskLevel}" (overlay still wins)`);
}

main().catch(console.error);
