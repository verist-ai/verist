// SPDX-License-Identifier: Apache-2.0

import {
  createContextFactory,
  defineStep,
  emit,
  invoke,
  suspend,
} from "@verist/core";
import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  captureArtifact,
  createSnapshot,
  normalizeCommands,
} from "./artifact.ts";
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
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [await captureArtifact("step-output", originalOutput)],
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
      expect(result.value.deltaDiff).toBeDefined();
      expect(result.value.deltaDiff!.equal).toBe(true);
    }
  });

  it("detects delta differences (ignores events)", async () => {
    // Different delta, same events structure
    const originalOutput = {
      delta: { result: 100 },
      events: [{ type: "doubled" }],
    };
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [await captureArtifact("step-output", originalOutput)],
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
      expect(result.value.deltaDiff).toBeDefined();
      expect(result.value.deltaDiff!.equal).toBe(false);
      // Diff should show delta.result changed from 100 to 42
      expect(result.value.deltaDiff!.entries).toEqual([
        { path: ["result"], before: 100, after: 42 },
      ]);
    }
  });

  it("reports equal when only events differ", async () => {
    // Same delta, different events — should be equal (events are not diffed)
    const originalOutput = { delta: { result: 42 }, events: [] };
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "double",
      input: { value: 21 },
      artifacts: [await captureArtifact("step-output", originalOutput)],
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
      expect(result.value.deltaDiff).toBeDefined();
      expect(result.value.deltaDiff!.equal).toBe(true);
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
    const snapshot = await createSnapshot({
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
      expect(result.value.deltaDiff).toBeUndefined();
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
      expect(result.value.deltaDiff).toBeUndefined();
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

    const snapshot = await createSnapshot({
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
    const snapshot = await createSnapshot({
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
    const snapshot = await createSnapshot({
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
  it("detects identical snapshots", async () => {
    const output = { delta: { x: 1 }, events: [] };
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

    const { inputDiff, deltaDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(inputDiff.equal).toBe(true);
    expect(deltaDiff?.equal).toBe(true);
  });

  it("detects input differences", async () => {
    const output = { delta: { x: 1 }, events: [] };
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

    const { inputDiff, deltaDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(inputDiff.equal).toBe(false);
    expect(deltaDiff?.equal).toBe(true);
  });

  it("detects delta differences (ignores events)", async () => {
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", { delta: { x: 1 }, events: [] }),
      ],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", {
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

  it("reports equal when only events differ", async () => {
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", { delta: { x: 1 }, events: [] }),
      ],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", {
          delta: { x: 1 },
          events: [{ type: "added" }],
        }),
      ],
    });

    const { deltaDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(deltaDiff?.equal).toBe(true);
  });

  it("returns undefined deltaDiff for hash-only snapshots", async () => {
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact(
          "step-output",
          { delta: { x: 1 }, events: [] },
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
        await captureArtifact("step-output", { delta: { x: 2 }, events: [] }),
      ],
    });

    const { inputDiff, deltaDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(inputDiff.equal).toBe(true);
    // Can't compare deltas when one is hash-only
    expect(deltaDiff).toBeUndefined();
  });

  it("uses first step-output when multiple exist", async () => {
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", { delta: { x: 1 }, events: [] }),
        await captureArtifact("step-output", { delta: { x: 999 }, events: [] }),
      ],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", { delta: { x: 2 }, events: [] }),
      ],
    });

    const { deltaDiff } = compareSnapshots(snapshot1, snapshot2);
    // First artifact wins: compares x:1 vs x:2, ignores x:999
    expect(deltaDiff?.entries).toEqual([{ path: ["x"], before: 1, after: 2 }]);
  });

  it("returns undefined deltaDiff for malformed step-output (missing delta key)", async () => {
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        // Malformed: no delta key (e.g., corrupted or migrated data)
        { kind: "step-output", hash: "sha256:abc", content: { result: 42 } },
      ],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", { delta: { x: 2 }, events: [] }),
      ],
    });

    const { deltaDiff } = compareSnapshots(snapshot1, snapshot2);
    // Malformed content treated as "no content" — can't compare
    expect(deltaDiff).toBeUndefined();
  });

  it("detects command differences (invoke to suspend)", async () => {
    const snapshot1 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", {
          delta: { x: 1 },
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
          delta: { x: 1 },
          events: [],
          commands: [
            suspend({ reason: "awaiting_docs", checkpoint: { id: 1 } }),
          ],
        }),
      ],
    });

    const { deltaDiff, commandsDiff } = compareSnapshots(snapshot1, snapshot2);
    expect(deltaDiff?.equal).toBe(true);
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
          delta: { x: 1 },
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
          delta: { x: 1 },
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
        await captureArtifact("step-output", { delta: { x: 1 }, events: [] }),
        await captureArtifact("step-commands", [invoke("verify", { id: 1 })]),
      ],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", { delta: { x: 1 }, events: [] }),
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
        await captureArtifact("step-output", { delta: { x: 1 }, events: [] }),
      ],
    });
    const snapshot2 = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: { a: 1 },
      artifacts: [
        await captureArtifact("step-output", {
          delta: { x: 1 },
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
  const contextFactory = createContextFactory({});

  it("detects command change (invoke to suspend)", async () => {
    const step = defineStep({
      name: "decide",
      input: z.object({ ready: z.boolean() }),
      delta: z.object({ status: z.string() }),
      run: async (input) => {
        if (input.ready) {
          return {
            delta: { status: "proceeding" },
            events: [],
            commands: [invoke("next", {})],
          };
        }
        return {
          delta: { status: "waiting" },
          events: [],
          commands: [suspend({ reason: "awaiting_input", checkpoint: {} })],
        };
      },
    });

    // Original ran with ready=false, now run with ready=true
    const originalOutput = {
      delta: { status: "waiting" },
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

    const ctx = contextFactory({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });
    const result = await recompute(snapshot, step, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.deltaDiff?.equal).toBe(false);
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
      delta: z.object({ result: z.number() }),
      run: async (input) => ({
        delta: { result: input.value * 2 },
        events: [],
        commands: [invoke("next", { value: input.value })],
      }),
    });

    const originalOutput = {
      delta: { result: 42 },
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

    const ctx = contextFactory({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });
    const result = await recompute(snapshot, step, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.deltaDiff?.equal).toBe(true);
      expect(result.value.commandsDiff?.equal).toBe(true);
    }
  });

  it("reads commands from step-commands artifact when present", async () => {
    const step = defineStep({
      name: "decide",
      input: z.object({ id: z.number() }),
      delta: z.object({ status: z.string() }),
      run: async () => ({
        delta: { status: "done" },
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
          delta: { status: "done" },
          events: [],
        }),
        await captureArtifact("step-commands", [invoke("next", { id: 1 })]),
      ],
    });

    const ctx = contextFactory({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });
    const result = await recompute(snapshot, step, ctx);

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
    expect(normalized[0]!.type).toBe("emit");
    expect(normalized[1]!.type).toBe("invoke");
    expect(normalized[2]!.type).toBe("suspend");
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
});
