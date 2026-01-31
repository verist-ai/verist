import { createContextFactory, defineStep } from "@verist/core";
import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { captureArtifact, createSnapshot } from "./artifact.ts";
import { compareSnapshots, recompute } from "./recompute.ts";
import type { Snapshot } from "./types.ts";

describe("recompute", () => {
  const doubleStep = defineStep({
    name: "double",
    input: z.object({ value: z.number() }),
    delta: z.object({ result: z.number() }),
    run: async (input) => ({
      delta: { result: input.value * 2 },
      events: [{ type: "doubled" }],
    }),
  });

  const contextFactory = createContextFactory({});

  it("executes step and returns diff on success", async () => {
    const originalOutput = {
      delta: { result: 42 },
      events: [{ type: "doubled" }],
    };
    const snapshot = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [captureArtifact("step-output", originalOutput)],
    });

    const ctx = contextFactory({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });
    const result = await recompute(snapshot, doubleStep, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output.delta).toEqual({ result: 42 });
      expect(result.value.diff).toBeDefined();
      expect(result.value.diff!.equal).toBe(true);
    }
  });

  it("detects delta differences (ignores events)", async () => {
    // Different delta, same events structure
    const originalOutput = {
      delta: { result: 100 },
      events: [{ type: "doubled" }],
    };
    const snapshot = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [captureArtifact("step-output", originalOutput)],
    });

    const ctx = contextFactory({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });
    const result = await recompute(snapshot, doubleStep, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output.delta).toEqual({ result: 42 });
      expect(result.value.diff).toBeDefined();
      expect(result.value.diff!.equal).toBe(false);
      // Diff should show delta.result changed from 100 to 42
      expect(result.value.diff!.entries).toEqual([
        { path: ["result"], before: 100, after: 42 },
      ]);
    }
  });

  it("reports equal when only events differ", async () => {
    // Same delta, different events — should be equal (events are not diffed)
    const originalOutput = { delta: { result: 42 }, events: [] };
    const snapshot = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [captureArtifact("step-output", originalOutput)],
    });

    const ctx = contextFactory({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });
    const result = await recompute(snapshot, doubleStep, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Delta is the same, so diff should be equal even though events differ
      expect(result.value.diff).toBeDefined();
      expect(result.value.diff!.equal).toBe(true);
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

    const ctx = contextFactory({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });
    const result = await recompute(snapshot, doubleStep, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INPUT_HASH_MISMATCH");
    }
  });

  it("returns undefined diff when original output is missing", async () => {
    const snapshot = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [],
    });

    const ctx = contextFactory({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });
    const result = await recompute(snapshot, doubleStep, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output.delta).toEqual({ result: 42 });
      // No original to compare → diff unavailable
      expect(result.value.diff).toBeUndefined();
    }
  });

  it("returns undefined diff when original is hash-only", async () => {
    const snapshot = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [
        captureArtifact(
          "step-output",
          { delta: { result: 100 }, events: [] },
          { hashOnly: true },
        ),
      ],
    });

    const ctx = contextFactory({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });
    const result = await recompute(snapshot, doubleStep, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output.delta).toEqual({ result: 42 });
      // Hash-only → can't compare → diff unavailable (consistent with compareSnapshots)
      expect(result.value.diff).toBeUndefined();
    }
  });

  it("returns error on execution failure", async () => {
    const failingStep = defineStep({
      name: "failing",
      input: z.object({ value: z.number() }),
      delta: z.object({ result: z.number() }),
      run: async () => {
        throw new Error("Step execution failed");
      },
    });

    const snapshot = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "failing",
      input: { value: 21 },
      artifacts: [],
    });

    const ctx = contextFactory({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });
    const result = await recompute(snapshot, failingStep, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("EXECUTION_FAILED");
      expect(result.error.message).toBe("Step execution failed");
    }
  });

  it("captures artifact with hashOnly option", async () => {
    const snapshot = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [],
    });

    const ctx = contextFactory({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });
    const result = await recompute(snapshot, doubleStep, ctx, {
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
    const snapshot = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [],
    });

    const ctx = contextFactory({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });
    const result = await recompute(snapshot, doubleStep, ctx, {
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
  it("detects identical snapshots", () => {
    const output = { delta: { x: 1 }, events: [] };
    const snapshot1 = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [captureArtifact("step-output", output)],
    });
    const snapshot2 = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [captureArtifact("step-output", output)],
    });

    const { inputDiff, deltaDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(inputDiff.equal).toBe(true);
    expect(deltaDiff?.equal).toBe(true);
  });

  it("detects input differences", () => {
    const output = { delta: { x: 1 }, events: [] };
    const snapshot1 = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [captureArtifact("step-output", output)],
    });
    const snapshot2 = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 2 },
      artifacts: [captureArtifact("step-output", output)],
    });

    const { inputDiff, deltaDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(inputDiff.equal).toBe(false);
    expect(deltaDiff?.equal).toBe(true);
  });

  it("detects delta differences (ignores events)", () => {
    const snapshot1 = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        captureArtifact("step-output", { delta: { x: 1 }, events: [] }),
      ],
    });
    const snapshot2 = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        captureArtifact("step-output", {
          delta: { x: 2 },
          events: [{ type: "new" }],
        }),
      ],
    });

    const { inputDiff, deltaDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(inputDiff.equal).toBe(true);
    expect(deltaDiff?.equal).toBe(false);
    expect(deltaDiff?.entries).toEqual([{ path: ["x"], before: 1, after: 2 }]);
  });

  it("reports equal when only events differ", () => {
    const snapshot1 = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        captureArtifact("step-output", { delta: { x: 1 }, events: [] }),
      ],
    });
    const snapshot2 = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        captureArtifact("step-output", {
          delta: { x: 1 },
          events: [{ type: "added" }],
        }),
      ],
    });

    const { deltaDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(deltaDiff?.equal).toBe(true);
  });

  it("returns undefined deltaDiff for hash-only snapshots", () => {
    const snapshot1 = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        captureArtifact(
          "step-output",
          { delta: { x: 1 }, events: [] },
          { hashOnly: true },
        ),
      ],
    });
    const snapshot2 = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        captureArtifact("step-output", { delta: { x: 2 }, events: [] }),
      ],
    });

    const { inputDiff, deltaDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(inputDiff.equal).toBe(true);
    // Can't compare deltas when one is hash-only
    expect(deltaDiff).toBeUndefined();
  });

  it("uses first step-output when multiple exist", () => {
    const snapshot1 = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        captureArtifact("step-output", { delta: { x: 1 }, events: [] }),
        captureArtifact("step-output", { delta: { x: 999 }, events: [] }),
      ],
    });
    const snapshot2 = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        captureArtifact("step-output", { delta: { x: 2 }, events: [] }),
      ],
    });

    const { deltaDiff } = compareSnapshots(snapshot1, snapshot2);
    // First artifact wins: compares x:1 vs x:2, ignores x:999
    expect(deltaDiff?.entries).toEqual([{ path: ["x"], before: 1, after: 2 }]);
  });

  it("returns undefined deltaDiff for malformed step-output (missing delta key)", () => {
    const snapshot1 = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        // Malformed: no delta key (e.g., corrupted or migrated data)
        { kind: "step-output", hash: "sha256:abc", content: { result: 42 } },
      ],
    });
    const snapshot2 = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        captureArtifact("step-output", { delta: { x: 2 }, events: [] }),
      ],
    });

    const { deltaDiff } = compareSnapshots(snapshot1, snapshot2);
    // Malformed content treated as "no content" — can't compare
    expect(deltaDiff).toBeUndefined();
  });
});
