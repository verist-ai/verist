import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { defineStep, createContextFactory } from "@verist/core";
import { recompute, compareSnapshots } from "./recompute.ts";
import { createSnapshot, captureArtifact } from "./artifact.ts";
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
      expect(result.value.diff.equal).toBe(true);
    }
  });

  it("detects output differences", async () => {
    const originalOutput = { delta: { result: 100 }, events: [] }; // Different from actual
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
      expect(result.value.diff.equal).toBe(false);
      expect(result.value.diff.entries.length).toBeGreaterThan(0);
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

  it("handles missing original output", async () => {
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
      expect(result.value.diff.equal).toBe(false);
      expect(result.value.diff.entries[0]?.before).toBeUndefined();
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

    const { inputDiff, outputDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(inputDiff.equal).toBe(true);
    expect(outputDiff.equal).toBe(true);
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

    const { inputDiff, outputDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(inputDiff.equal).toBe(false);
    expect(outputDiff.equal).toBe(true);
  });

  it("detects output differences", () => {
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
        captureArtifact("step-output", { delta: { x: 2 }, events: [] }),
      ],
    });

    const { inputDiff, outputDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(inputDiff.equal).toBe(true);
    expect(outputDiff.equal).toBe(false);
  });
});
