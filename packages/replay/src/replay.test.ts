import { describe, it, expect, beforeEach } from "bun:test";
import { replay, createReplayContext } from "./replay.ts";
import { createSnapshot, captureArtifact } from "./artifact.ts";
import type { Snapshot } from "./types.ts";

describe("replay", () => {
  let mockSnapshot: Snapshot;

  beforeEach(() => {
    const originalDateNow = Date.now;
    Date.now = () => 1700000000000;

    const output = { delta: { result: 42 }, events: [] };
    mockSnapshot = createSnapshot({
      workflowId: "test-wf",
      workflowVersion: "1.0.0",
      stepName: "compute",
      input: { value: 21 },
      artifacts: [captureArtifact("step-output", output)],
    });

    Date.now = originalDateNow;
  });

  it("returns stored output artifact on success", async () => {
    const result = await replay(mockSnapshot, async () => undefined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output).toEqual({
        delta: { result: 42 },
        events: [],
      });
      expect(result.value.usedArtifacts.length).toBe(1);
    }
  });

  it("returns error when output artifact is missing", async () => {
    const snapshotWithoutOutput: Snapshot = {
      ...mockSnapshot,
      artifacts: [],
    };

    const result = await replay(snapshotWithoutOutput, async () => undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MISSING_OUTPUT");
      expect(result.error.message).toContain("compute");
    }
  });
});

describe("createReplayContext", () => {
  it("creates context with indexed artifacts", () => {
    const artifact = captureArtifact("llm-output", { text: "response" });
    const snapshot = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: {},
      artifacts: [artifact],
    });

    const ctx = createReplayContext(snapshot, async () => undefined);

    expect(ctx.artifacts.has(artifact.hash)).toBe(true);
    expect(ctx.artifacts.get(artifact.hash)).toEqual(artifact);
  });
});
