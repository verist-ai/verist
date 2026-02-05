// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import type { Command } from "./command.ts";
import { emit, invoke, suspend } from "./command.ts";
import { compareSnapshots, recompute } from "./recompute.ts";
import {
  captureArtifact,
  createSnapshot,
  normalizeCommands,
} from "./snapshot.ts";
import { defineStep } from "./step.ts";
import type { Snapshot } from "./types.ts";

describe("recompute", () => {
  const doubleStep = defineStep({
    name: "double",
    input: z.object({ value: z.number() }),
    output: z.object({ result: z.number() }),
    run: async (input) => ({
      output: { result: input.value * 2 },
      events: [{ type: "doubled" }],
    }),
  });

  it("executes step and returns diff on success", async () => {
    const originalOutput = {
      output: { result: 42 },
      events: [{ type: "doubled" }],
    };
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [await captureArtifact("step-output", originalOutput)],
    });

    const result = await recompute(snapshot, doubleStep);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rawOutput).toEqual({ result: 42 });
      expect(result.value.comparable).toBe(true);
      expect(result.value.outputDiff).toBeDefined();
      expect(result.value.outputDiff!.equal).toBe(true);
    }
  });

  it("detects output differences (ignores events)", async () => {
    // Different output, same events structure
    const originalOutput = {
      output: { result: 100 },
      events: [{ type: "doubled" }],
    };
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [await captureArtifact("step-output", originalOutput)],
    });

    const result = await recompute(snapshot, doubleStep);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rawOutput).toEqual({ result: 42 });
      expect(result.value.outputDiff).toBeDefined();
      expect(result.value.outputDiff!.equal).toBe(false);
      // Diff should show result changed from 100 to 42
      expect(result.value.outputDiff!.entries).toEqual([
        { path: ["result"], before: 100, after: 42 },
      ]);
    }
  });

  it("reports equal when only events differ", async () => {
    // Same output, different events — should be equal (events are not diffed)
    const originalOutput = { output: { result: 42 }, events: [] };
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [await captureArtifact("step-output", originalOutput)],
    });

    const result = await recompute(snapshot, doubleStep);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Output is the same, so diff should be equal even though events differ
      expect(result.value.outputDiff).toBeDefined();
      expect(result.value.outputDiff!.equal).toBe(true);
    }
  });

  it("returns error on input hash mismatch", async () => {
    const snapshot: Snapshot = {
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      inputHash: "sha256:wrong-hash",
      artifacts: [],
      capturedAt: Date.now(),
    };

    const result = await recompute(snapshot, doubleStep);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("input_hash_mismatch");
    }
  });

  it("returns undefined diff when original output is missing", async () => {
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [],
    });

    const result = await recompute(snapshot, doubleStep);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rawOutput).toEqual({ result: 42 });
      // No original to compare → not comparable
      expect(result.value.comparable).toBe(false);
      expect(result.value.outputDiff).toBeUndefined();
    }
  });

  it("returns undefined diff when original is hash-only", async () => {
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [
        await captureArtifact(
          "step-output",
          { output: { result: 100 }, events: [] },
          { hashOnly: true },
        ),
      ],
    });

    const result = await recompute(snapshot, doubleStep);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rawOutput).toEqual({ result: 42 });
      // Hash-only → can't compare, but valid output → clean
      expect(result.value.comparable).toBe(false);
      expect(result.value.outputDiff).toBeUndefined();
      expect(result.value.status).toBe("clean");
    }
  });

  it("returns error on execution failure", async () => {
    const failingStep = defineStep({
      name: "failing",
      input: z.object({ value: z.number() }),
      output: z.object({ result: z.number() }),
      run: async () => {
        throw new Error("Step execution failed");
      },
    });

    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "failing",
      input: { value: 21 },
      artifacts: [],
    });

    const result = await recompute(snapshot, failingStep);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("execution_failed");
      expect(result.error.message).toBe("Step execution failed");
    }
  });

  it("captures artifact with hashOnly option", async () => {
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [],
    });

    const result = await recompute(snapshot, doubleStep, {
      captureArtifacts: { hashOnly: true },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outputArtifact).toBeDefined();
      expect(result.value.outputArtifact?.hash).toMatch(/^sha256:/);
      expect(result.value.outputArtifact?.content).toBeUndefined();
    }
  });

  it("captures artifact with full content when boolean true", async () => {
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [],
    });

    const result = await recompute(snapshot, doubleStep, {
      captureArtifacts: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outputArtifact).toBeDefined();
      expect(result.value.outputArtifact?.content).toBeDefined();
    }
  });
});

describe("compareSnapshots", () => {
  it("detects identical snapshots", async () => {
    const output = { output: { x: 1 }, events: [] };
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [await captureArtifact("step-output", output)],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [await captureArtifact("step-output", output)],
    });

    const { inputDiff, outputDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(inputDiff.equal).toBe(true);
    expect(outputDiff?.equal).toBe(true);
  });

  it("detects input differences", async () => {
    const output = { output: { x: 1 }, events: [] };
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [await captureArtifact("step-output", output)],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 2 },
      artifacts: [await captureArtifact("step-output", output)],
    });

    const { inputDiff, outputDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(inputDiff.equal).toBe(false);
    expect(outputDiff?.equal).toBe(true);
  });

  it("detects output differences (ignores events)", async () => {
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", { output: { x: 1 }, events: [] }),
      ],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", {
          output: { x: 2 },
          events: [{ type: "new" }],
        }),
      ],
    });

    const { inputDiff, outputDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(inputDiff.equal).toBe(true);
    expect(outputDiff?.equal).toBe(false);
    expect(outputDiff?.entries).toEqual([{ path: ["x"], before: 1, after: 2 }]);
  });

  it("reports equal when only events differ", async () => {
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", { output: { x: 1 }, events: [] }),
      ],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", {
          output: { x: 1 },
          events: [{ type: "added" }],
        }),
      ],
    });

    const { outputDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(outputDiff?.equal).toBe(true);
  });

  it("returns undefined outputDiff for hash-only snapshots", async () => {
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact(
          "step-output",
          { output: { x: 1 }, events: [] },
          { hashOnly: true },
        ),
      ],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", { output: { x: 2 }, events: [] }),
      ],
    });

    const { inputDiff, outputDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(inputDiff.equal).toBe(true);
    // Can't compare outputs when one is hash-only
    expect(outputDiff).toBeUndefined();
  });

  it("uses first step-output when multiple exist", async () => {
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", { output: { x: 1 }, events: [] }),
        await captureArtifact("step-output", {
          output: { x: 999 },
          events: [],
        }),
      ],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", { output: { x: 2 }, events: [] }),
      ],
    });

    const { outputDiff } = compareSnapshots(snapshot1, snapshot2);
    // First artifact wins: compares x:1 vs x:2, ignores x:999
    expect(outputDiff?.entries).toEqual([{ path: ["x"], before: 1, after: 2 }]);
  });

  it("returns undefined outputDiff for malformed step-output (missing output key)", async () => {
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        // Malformed: no output key (e.g., corrupted data)
        { kind: "step-output", hash: "sha256:abc", content: { result: 42 } },
      ],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", { output: { x: 2 }, events: [] }),
      ],
    });

    const { outputDiff } = compareSnapshots(snapshot1, snapshot2);
    // Malformed content treated as "no content" — can't compare
    expect(outputDiff).toBeUndefined();
  });

  it("detects command differences (invoke to suspend)", async () => {
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", {
          output: { x: 1 },
          events: [],
          commands: [invoke("verify", { id: 1 })],
        }),
      ],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", {
          output: { x: 1 },
          events: [],
          commands: [
            suspend({ reason: "awaiting_docs", checkpoint: { id: 1 } }),
          ],
        }),
      ],
    });

    const { outputDiff, commandsDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(outputDiff?.equal).toBe(true);
    expect(commandsDiff?.equal).toBe(false);
    // Command type changed from invoke to suspend
    expect(commandsDiff?.entries.some((e) => e.path.includes("type"))).toBe(
      true,
    );
  });

  it("reports equal when commands are identical", async () => {
    const commands = [invoke("verify", { id: 1 })];
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", {
          output: { x: 1 },
          events: [],
          commands,
        }),
      ],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", {
          output: { x: 1 },
          events: [],
          commands: [invoke("verify", { id: 1 })],
        }),
      ],
    });

    const { commandsDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(commandsDiff?.equal).toBe(true);
  });

  it("uses step-commands artifact when present", async () => {
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", { output: { x: 1 }, events: [] }),
        await captureArtifact("step-commands", [invoke("verify", { id: 1 })]),
      ],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", { output: { x: 1 }, events: [] }),
        await captureArtifact("step-commands", [invoke("verify", { id: 2 })]),
      ],
    });

    const { commandsDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(commandsDiff?.equal).toBe(false);
    expect(commandsDiff?.entries).toEqual([
      { path: [0, "input", "id"], before: 1, after: 2 },
    ]);
  });

  it("returns undefined commandsDiff when commands unavailable", async () => {
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", { output: { x: 1 }, events: [] }),
      ],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", {
          output: { x: 1 },
          events: [],
          commands: [invoke("verify", {})],
        }),
      ],
    });

    const { commandsDiff } = compareSnapshots(snapshot1, snapshot2);
    // First snapshot has no commands → can't compare
    expect(commandsDiff).toBeUndefined();
  });
});

describe("recompute command diffing", () => {
  it("detects command change (invoke to suspend)", async () => {
    const step = defineStep({
      name: "decide",
      input: z.object({ ready: z.boolean() }),
      output: z.object({ status: z.string() }),
      run: async (input) => {
        if (input.ready) {
          return {
            output: { status: "proceeding" },
            events: [],
            commands: [invoke("next", {})],
          };
        }
        return {
          output: { status: "waiting" },
          events: [],
          commands: [suspend({ reason: "awaiting_input", checkpoint: {} })],
        };
      },
    });

    // Original ran with ready=false, now run with ready=true
    const originalOutput = {
      output: { status: "waiting" },
      events: [],
      commands: [suspend({ reason: "awaiting_input", checkpoint: {} })],
    };
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "decide",
      input: { ready: true },
      artifacts: [await captureArtifact("step-output", originalOutput)],
    });

    const result = await recompute(snapshot, step);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outputDiff?.equal).toBe(false);
      expect(result.value.commandsDiff?.equal).toBe(false);
      // Commands changed from suspend to invoke
      expect(
        result.value.commandsDiff?.entries.some((e) => e.path.includes("type")),
      ).toBe(true);
    }
  });

  it("returns equal commandsDiff when commands unchanged", async () => {
    const step = defineStep({
      name: "stable",
      input: z.object({ value: z.number() }),
      output: z.object({ result: z.number() }),
      run: async (input) => ({
        output: { result: input.value * 2 },
        events: [],
        commands: [invoke("next", { value: input.value })],
      }),
    });

    const originalOutput = {
      output: { result: 42 },
      events: [],
      commands: [invoke("next", { value: 21 })],
    };
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "stable",
      input: { value: 21 },
      artifacts: [await captureArtifact("step-output", originalOutput)],
    });

    const result = await recompute(snapshot, step);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outputDiff?.equal).toBe(true);
      expect(result.value.commandsDiff?.equal).toBe(true);
    }
  });

  it("reads commands from step-commands artifact when present", async () => {
    const step = defineStep({
      name: "decide",
      input: z.object({ id: z.number() }),
      output: z.object({ status: z.string() }),
      run: async () => ({
        output: { status: "done" },
        events: [],
        commands: [invoke("next", { id: 2 })],
      }),
    });

    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "decide",
      input: { id: 1 },
      artifacts: [
        await captureArtifact("step-output", {
          output: { status: "done" },
          events: [],
        }),
        await captureArtifact("step-commands", [invoke("next", { id: 1 })]),
      ],
    });

    const result = await recompute(snapshot, step);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Original had id:1, new has id:2
      expect(result.value.commandsDiff?.equal).toBe(false);
      expect(result.value.commandsDiff?.entries).toEqual([
        { path: [0, "input", "id"], before: 1, after: 2 },
      ]);
    }
  });
});

describe("recompute ctx.emitEvent", () => {
  it("captures events emitted via ctx.emitEvent in artifact", async () => {
    const step = defineStep({
      name: "emit-test",
      input: z.object({ value: z.number() }),
      output: z.object({ result: z.number() }),
      run: async (input, ctx) => {
        // Simulate adapter auto-emit (e.g., extract() auto-emit)
        ctx.emitEvent({ type: "llm.extracted", payload: { model: "gpt-4" } });
        return {
          output: { result: input.value * 2 },
          events: [{ type: "step.done" }],
        };
      },
    });

    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "emit-test",
      input: { value: 21 },
      artifacts: [],
    });

    const result = await recompute(snapshot, step, {
      captureArtifacts: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const content = result.value.outputArtifact?.content as {
        events: unknown[];
      };
      // Both ctx.emitEvent events and step-returned events are captured
      expect(content.events).toEqual([
        { type: "llm.extracted", payload: { model: "gpt-4" } },
        { type: "step.done" },
      ]);
    }
  });
});

describe("recompute validation", () => {
  it("validates input schema by default", async () => {
    const step = defineStep({
      name: "typed",
      input: z.object({ value: z.number() }),
      output: z.object({ result: z.number() }),
      run: async (input) => ({
        output: { result: input.value * 2 },
        events: [],
      }),
    });

    // Snapshot with string value instead of number
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "typed",
      input: { value: "not-a-number" },
      artifacts: [],
    });

    const result = await recompute(snapshot, step);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("input_validation");
      expect(result.error.message).toContain("Input validation failed");
      expect(result.error.message).toContain("`verist capture`");
    }
  });

  it("reports schema violations as observations", async () => {
    const step = defineStep({
      name: "bad-output",
      input: z.object({ value: z.number() }),
      output: z.object({ result: z.number() }),
      // Returns wrong type for output
      run: async () => ({
        output: { result: "not-a-number" as unknown as number },
        events: [],
      }),
    });

    const originalOutput = {
      output: { result: 42 },
      events: [],
    };
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "bad-output",
      input: { value: 21 },
      artifacts: [await captureArtifact("step-output", originalOutput)],
    });

    const result = await recompute(snapshot, step);

    // Validation is observation, not gate — always returns ok()
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("schema_violation");
      expect(result.value.schemaViolations).toHaveLength(1);
      expect(result.value.schemaViolations[0]!.kind).toBe("type");
      expect(result.value.schemaViolations[0]!.path).toEqual(["result"]);
      // Diff is still computed despite schema violation
      expect(result.value.outputDiff).toBeDefined();
      expect(result.value.outputDiff!.equal).toBe(false);
    }
  });

  it("reports missing nested fields as schema violations with kind 'missing'", async () => {
    // Top-level fields are partial (partialOutputSchema), but nested required fields
    // within present structures must still validate — this is the core wedge scenario.
    const step = defineStep({
      name: "missing-nested",
      input: z.object({ value: z.number() }),
      output: z.object({
        items: z.array(z.object({ name: z.string(), score: z.number() })),
      }),
      // Returns item missing required 'score' field
      run: async () => ({
        output: {
          items: [
            { name: "test" } as unknown as { name: string; score: number },
          ],
        },
        events: [],
      }),
    });

    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "missing-nested",
      input: { value: 1 },
      artifacts: [],
    });

    const result = await recompute(snapshot, step);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("schema_violation");
      expect(result.value.schemaViolations).toHaveLength(1);
      expect(result.value.schemaViolations[0]!.kind).toBe("missing");
      expect(result.value.schemaViolations[0]!.path).toEqual([
        "items",
        0,
        "score",
      ]);
    }
  });

  it("schema violations + value changes coexist in one result", async () => {
    // Pins the wedge invariant: missing field AND value change → both present
    const step = defineStep({
      name: "mixed",
      input: z.object({ value: z.number() }),
      output: z.object({
        claims: z.array(z.object({ text: z.string(), amount: z.number() })),
      }),
      run: async () => ({
        output: {
          claims: [
            { text: "Acme had strong revenue" } as unknown as {
              text: string;
              amount: number;
            },
          ],
        },
        events: [],
      }),
    });

    const originalOutput = {
      output: {
        claims: [{ text: "Acme reported $4.2M", amount: 4200000 }],
      },
      events: [],
    };
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "mixed",
      input: { value: 1 },
      artifacts: [await captureArtifact("step-output", originalOutput)],
    });

    const result = await recompute(snapshot, step);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Highest severity wins
      expect(result.value.status).toBe("schema_violation");
      // Schema violation: amount is missing
      expect(result.value.schemaViolations.length).toBeGreaterThanOrEqual(1);
      expect(
        result.value.schemaViolations.some(
          (v) => v.kind === "missing" && v.path.includes("amount"),
        ),
      ).toBe(true);
      // Value change: text changed
      expect(result.value.outputDiff).toBeDefined();
      expect(result.value.outputDiff!.equal).toBe(false);
      expect(
        result.value.outputDiff!.entries.some((e) => e.path.includes("text")),
      ).toBe(true);
    }
  });

  it("returns clean status when no violations and equal diff", async () => {
    const step = defineStep({
      name: "clean",
      input: z.object({ value: z.number() }),
      output: z.object({ result: z.number() }),
      run: async (input) => ({
        output: { result: input.value * 2 },
        events: [],
      }),
    });

    const originalOutput = { output: { result: 42 }, events: [] };
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "clean",
      input: { value: 21 },
      artifacts: [await captureArtifact("step-output", originalOutput)],
    });

    const result = await recompute(snapshot, step);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("clean");
      expect(result.value.schemaViolations).toEqual([]);
      expect(result.value.outputDiff!.equal).toBe(true);
    }
  });

  it("returns value_changed status when diff but no violations", async () => {
    const step = defineStep({
      name: "changed",
      input: z.object({ value: z.number() }),
      output: z.object({ result: z.number() }),
      run: async (input) => ({
        output: { result: input.value * 2 },
        events: [],
      }),
    });

    const originalOutput = { output: { result: 100 }, events: [] };
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "changed",
      input: { value: 21 },
      artifacts: [await captureArtifact("step-output", originalOutput)],
    });

    const result = await recompute(snapshot, step);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("value_changed");
      expect(result.value.schemaViolations).toEqual([]);
      expect(result.value.outputDiff!.equal).toBe(false);
    }
  });

  it("uses parsed output for diff (Zod defaults don't cause false diff)", async () => {
    // When validation succeeds, recompute uses the Zod-parsed value for diffing.
    // This prevents false diffs from defaults/coercions — matching runStep semantics.
    const step = defineStep({
      name: "with-defaults",
      input: z.object({ value: z.number() }),
      output: z.object({
        result: z.number(),
        label: z.string().default("untitled"),
      }),
      run: async (input) => ({
        // Step returns without label — Zod default fills it in
        output: { result: input.value * 2 } as {
          result: number;
          label: string;
        },
        events: [],
      }),
    });

    // Baseline was captured with the Zod-parsed output (label filled by default)
    const originalOutput = {
      output: { result: 42, label: "untitled" },
      events: [],
    };
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "with-defaults",
      input: { value: 21 },
      artifacts: [await captureArtifact("step-output", originalOutput)],
    });

    const result = await recompute(snapshot, step);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // parsedOutput has the default applied
      expect(result.value.parsedOutput).toEqual({
        result: 42,
        label: "untitled",
      });
      // Diff compares parsed output vs baseline — no false diff
      expect(result.value.status).toBe("clean");
      expect(result.value.outputDiff!.equal).toBe(true);
    }
  });

  it("returns parsedOutput only when output validation succeeds", async () => {
    const step = defineStep({
      name: "typed",
      input: z.object({ value: z.number() }),
      output: z.object({ result: z.number() }),
      run: async () => ({
        output: { result: "not-a-number" as unknown as number },
        events: [],
      }),
    });

    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "typed",
      input: { value: 21 },
      artifacts: [],
    });

    const result = await recompute(snapshot, step);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Schema failed — parsedOutput is absent
      expect(result.value.parsedOutput).toBeUndefined();
      expect(result.value.schemaViolations.length).toBeGreaterThan(0);
    }
  });

  it("malformed step-output (missing output key) is not comparable", async () => {
    const step = defineStep({
      name: "typed",
      input: z.object({ value: z.number() }),
      output: z.object({ result: z.number() }),
      run: async (input) => ({
        output: { result: input.value * 2 },
        events: [],
      }),
    });

    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "typed",
      input: { value: 21 },
      artifacts: [
        // Malformed: no output key (e.g., corrupted data)
        { kind: "step-output", hash: "sha256:abc", content: { result: 42 } },
      ],
    });

    const result = await recompute(snapshot, step);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.comparable).toBe(false);
      expect(result.value.outputDiff).toBeUndefined();
      expect(result.value.status).toBe("clean");
    }
  });

  it("hash-only baseline is not comparable but status is still computed", async () => {
    const step = defineStep({
      name: "typed",
      input: z.object({ value: z.number() }),
      output: z.object({ result: z.number() }),
      run: async () => ({
        output: { result: "not-a-number" as unknown as number },
        events: [],
      }),
    });

    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "typed",
      input: { value: 21 },
      artifacts: [
        await captureArtifact(
          "step-output",
          { output: { result: 42 }, events: [] },
          { hashOnly: true },
        ),
      ],
    });

    const result = await recompute(snapshot, step);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Not comparable (hash-only) but schema violations still detected
      expect(result.value.comparable).toBe(false);
      expect(result.value.outputDiff).toBeUndefined();
      expect(result.value.status).toBe("schema_violation");
      expect(result.value.schemaViolations.length).toBeGreaterThan(0);
    }
  });

  it("strictOutput catches missing top-level fields that partial allows", async () => {
    const step = defineStep({
      name: "strict-test",
      input: z.object({ value: z.number() }),
      output: z.object({ a: z.string(), b: z.string() }),
      run: async () => ({
        // Returns only `a`, missing `b`
        output: { a: "x" } as unknown as { a: string; b: string },
        events: [],
      }),
    });

    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "strict-test",
      input: { value: 1 },
      artifacts: [],
    });

    // Default (partial) — missing `b` is allowed
    const lenient = await recompute(snapshot, step);
    expect(lenient.ok).toBe(true);
    if (lenient.ok) {
      expect(lenient.value.status).toBe("clean");
      expect(lenient.value.schemaViolations).toEqual([]);
    }

    // strictOutput — missing `b` is caught
    const strict = await recompute(snapshot, step, {
      strictOutput: true,
    });
    expect(strict.ok).toBe(true);
    if (strict.ok) {
      expect(strict.value.status).toBe("schema_violation");
      expect(strict.value.schemaViolations).toHaveLength(1);
      expect(strict.value.schemaViolations[0]!.kind).toBe("missing");
      expect(strict.value.schemaViolations[0]!.path).toEqual(["b"]);
    }
  });

  it("skips validation when validate is false", async () => {
    const step = defineStep({
      name: "lenient",
      input: z.object({ value: z.number() }),
      output: z.object({ result: z.number() }),
      // Works despite bad input because validation is explicitly off
      run: async () => ({
        output: { result: 42 },
        events: [],
      }),
    });

    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "lenient",
      input: { value: "not-a-number" },
      artifacts: [],
    });

    // Explicit opt-out: no validation — schemaViolations should be empty
    const result = await recompute(snapshot, step, { validate: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaViolations).toEqual([]);
    }
  });
});

describe("normalizeCommands", () => {
  it("returns empty array for undefined or empty", () => {
    expect(normalizeCommands(undefined)).toEqual([]);
    expect(normalizeCommands([])).toEqual([]);
  });

  it("sorts commands by type", () => {
    const commands = [
      suspend({ reason: "wait", checkpoint: {} }),
      emit("topic", {}),
      invoke("step", {}),
    ];
    const normalized = normalizeCommands(commands);

    expect(normalized).toHaveLength(3);
    expect((normalized[0] as { type: string }).type).toBe("emit");
    expect((normalized[1] as { type: string }).type).toBe("invoke");
    expect((normalized[2] as { type: string }).type).toBe("suspend");
  });

  it("sorts commands of same type by identifying field", () => {
    const commands = [
      invoke("zebra", {}),
      invoke("alpha", {}),
      invoke("middle", {}),
    ];
    const normalized = normalizeCommands(commands);

    expect((normalized[0] as { step: string }).step).toBe("alpha");
    expect((normalized[1] as { step: string }).step).toBe("middle");
    expect((normalized[2] as { step: string }).step).toBe("zebra");
  });

  it("produces identical output for same commands in different order", () => {
    const commands1 = [invoke("b", {}), emit("topic", {}), invoke("a", {})];
    const commands2 = [emit("topic", {}), invoke("a", {}), invoke("b", {})];

    expect(normalizeCommands(commands1)).toEqual(normalizeCommands(commands2));
  });

  it("distinguishes commands with same type and identifier but different payloads", () => {
    const commands1 = [
      invoke("verify", { id: 1 }),
      invoke("verify", { id: 2 }),
    ];
    const commands2 = [
      invoke("verify", { id: 2 }),
      invoke("verify", { id: 1 }),
    ];

    // Same commands, different order → same normalized result
    expect(normalizeCommands(commands1)).toEqual(normalizeCommands(commands2));

    // But two distinct commands with different payloads remain distinct
    const normalized = normalizeCommands(commands1);
    expect(normalized).toHaveLength(2);
    expect((normalized[0] as { input: { id: number } }).input.id).not.toBe(
      (normalized[1] as { input: { id: number } }).input.id,
    );
  });

  it("strips runtime metadata — only semantic fields affect hash", () => {
    // Simulate runner-added fields on Command objects
    const withMetadata = [
      {
        ...invoke("step", { id: 1 }),
        runId: "run-1",
        attempt: 3,
        createdAt: Date.now(),
      },
    ] as unknown as Command[];
    const withoutMetadata = [invoke("step", { id: 1 })];

    // Normalized output should be identical — runtime fields stripped
    expect(normalizeCommands(withMetadata)).toEqual(
      normalizeCommands(withoutMetadata),
    );
  });
});
