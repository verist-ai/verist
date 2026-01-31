import { beforeEach, describe, expect, it } from "bun:test";
import { captureArtifact, createSnapshot } from "./artifact.ts";
import { loadOutput } from "./replay.ts";
import type { Snapshot } from "./types.ts";

describe("loadOutput", () => {
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

  it("returns stored output on success", () => {
    const result = loadOutput(mockSnapshot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        delta: { result: 42 },
        events: [],
      });
    }
  });

  it("returns error when output artifact is missing", () => {
    const snapshotWithoutOutput: Snapshot = {
      ...mockSnapshot,
      artifacts: [],
    };

    const result = loadOutput(snapshotWithoutOutput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MISSING_OUTPUT");
      expect(result.error.message).toContain("compute");
    }
  });

  it("returns error when output hash is corrupted", () => {
    const corruptedSnapshot: Snapshot = {
      ...mockSnapshot,
      artifacts: [
        {
          hash: "sha256:corrupted-hash-value",
          kind: "step-output",
          content: { delta: { result: 42 }, events: [] },
        },
      ],
    };

    const result = loadOutput(corruptedSnapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("OUTPUT_CORRUPTED");
      expect(result.error.message).toContain("hash mismatch");
    }
  });

  it("returns error for hash-only snapshot", () => {
    const hashOnlySnapshot: Snapshot = {
      ...mockSnapshot,
      artifacts: [
        captureArtifact("step-output", { delta: {} }, { hashOnly: true }),
      ],
    };

    const result = loadOutput(hashOnlySnapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MISSING_OUTPUT");
      expect(result.error.message).toContain("hash-only");
    }
  });
});
