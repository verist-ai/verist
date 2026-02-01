// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it } from "bun:test";
import { captureArtifact, createSnapshot } from "./artifact.ts";
import { loadOutput } from "./replay.ts";
import type { Snapshot } from "./types.ts";

describe("loadOutput", () => {
  let mockSnapshot: Snapshot;

  beforeEach(async () => {
    const originalDateNow = Date.now;
    Date.now = () => 1700000000000;

    const output = { delta: { result: 42 }, events: [] };
    mockSnapshot = await createSnapshot({
      workflowId: "test-wf",
      workflowVersion: "1.0.0",
      stepName: "compute",
      input: { value: 21 },
      artifacts: [await captureArtifact("step-output", output)],
    });

    Date.now = originalDateNow;
  });

  it("returns stored output on success", async () => {
    const result = await loadOutput(mockSnapshot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        delta: { result: 42 },
        events: [],
      });
    }
  });

  it("returns error when output artifact is missing", async () => {
    const snapshotWithoutOutput: Snapshot = {
      ...mockSnapshot,
      artifacts: [],
    };

    const result = await loadOutput(snapshotWithoutOutput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MISSING_OUTPUT");
      expect(result.error.message).toContain("compute");
    }
  });

  it("returns error when output hash is corrupted", async () => {
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

    const result = await loadOutput(corruptedSnapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("OUTPUT_CORRUPTED");
      expect(result.error.message).toContain("hash mismatch");
    }
  });

  it("returns error for hash-only snapshot", async () => {
    const hashOnlySnapshot: Snapshot = {
      ...mockSnapshot,
      artifacts: [
        await captureArtifact("step-output", { delta: {} }, { hashOnly: true }),
      ],
    };

    const result = await loadOutput(hashOnlySnapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MISSING_OUTPUT");
      expect(result.error.message).toContain("hash-only");
    }
  });
});
