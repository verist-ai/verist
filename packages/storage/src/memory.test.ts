// SPDX-License-Identifier: Apache-2.0

import { describe, expect, expectTypeOf, it } from "bun:test";
import { effectiveState, type StateSnapshot } from "./index.ts";
import { createMemoryStore } from "./memory.ts";

type TestState = { score: number; risk: string };

describe("createMemoryStore", () => {
  it("load returns null for non-existent run", async () => {
    const store = createMemoryStore();
    const result = await store.load("wf-1", "run-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });

  it("commit creates new run (version 0 → 1)", async () => {
    const store = createMemoryStore();
    const result = await store.commit({
      workflowId: "wf-1",
      runId: "run-1",
      stepId: "step-1",
      expectedVersion: 0,
      delta: { score: 0.8 },
      events: [{ type: "scored" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe(1);
    expect(result.value.computed).toEqual({ score: 0.8 });
    expect(result.value.overlay).toEqual({});
  });

  it("commit with wrong expectedVersion returns conflict", async () => {
    const store = createMemoryStore();
    await store.commit({
      workflowId: "wf-1",
      runId: "run-1",
      stepId: "step-1",
      expectedVersion: 0,
      delta: { score: 0.8 },
      events: [],
    });

    const result = await store.commit({
      workflowId: "wf-1",
      runId: "run-1",
      stepId: "step-2",
      expectedVersion: 5,
      delta: { score: 0.9 },
      events: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("conflict");
    expect(result.error.reason).toBe("version_mismatch");
  });

  it("commit with expectedVersion 0 on existing run returns conflict", async () => {
    const store = createMemoryStore();
    await store.commit({
      workflowId: "wf-1",
      runId: "run-1",
      stepId: "step-1",
      expectedVersion: 0,
      delta: { score: 0.8 },
      events: [],
    });

    const result = await store.commit({
      workflowId: "wf-1",
      runId: "run-1",
      stepId: "step-1",
      expectedVersion: 0,
      delta: { score: 0.9 },
      events: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("conflict");
    expect(result.error.reason).toBe("run_exists");
  });

  it("setOverlay merges into overlay layer", async () => {
    const store = createMemoryStore();
    await store.commit({
      workflowId: "wf-1",
      runId: "run-1",
      stepId: "step-1",
      expectedVersion: 0,
      delta: { score: 0.8, risk: "high" },
      events: [],
    });

    const result = await store.setOverlay<{ score: number; risk: string }>(
      "wf-1",
      "run-1",
      { risk: "low" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.overlay).toEqual({ risk: "low" });
    expect(result.value.computed).toEqual({ score: 0.8, risk: "high" });
  });

  it("overlay preserved across recompute; effective uses overlay precedence", async () => {
    const store = createMemoryStore();

    // Initial commit
    await store.commit({
      workflowId: "wf-1",
      runId: "run-1",
      stepId: "step-1",
      expectedVersion: 0,
      delta: { score: 0.8, risk: "high" },
      events: [],
    });

    // Human overrides risk
    await store.setOverlay("wf-1", "run-1", { risk: "low" });

    // Verify effective before recompute
    const before = await store.load<TestState>("wf-1", "run-1");
    expect(before.ok).toBe(true);
    if (!before.ok || !before.value) return;
    const effectiveBefore = effectiveState(before.value);
    expect(effectiveBefore).toEqual({ score: 0.8, risk: "low" });

    // Recompute: new computed score, risk stays "high" in computed
    const result = await store.commit({
      workflowId: "wf-1",
      runId: "run-1",
      stepId: "step-1",
      expectedVersion: 1,
      delta: { score: 0.95, risk: "medium" },
      events: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Computed changed
    expect(result.value.computed).toEqual({ score: 0.95, risk: "medium" });
    // Overlay preserved
    expect(result.value.overlay).toEqual({ risk: "low" });
    // Effective: overlay wins
    const effectiveAfter = effectiveState(
      result.value as StateSnapshot<TestState>,
    );
    expect(effectiveAfter).toEqual({ score: 0.95, risk: "low" });
  });

  it("setOverlay on non-existent run returns not_found", async () => {
    const store = createMemoryStore();
    const result = await store.setOverlay("wf-1", "run-1", { risk: "low" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("not_found");
  });

  it("commit on non-existent run with expectedVersion > 0 returns not_found", async () => {
    const store = createMemoryStore();
    const result = await store.commit({
      workflowId: "wf-1",
      runId: "run-1",
      stepId: "step-1",
      expectedVersion: 1,
      delta: { score: 0.8 },
      events: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("not_found");
  });

  it("setOverlay strips undefined values", async () => {
    const store = createMemoryStore();
    await store.commit({
      workflowId: "wf-1",
      runId: "run-1",
      stepId: "step-1",
      expectedVersion: 0,
      delta: { score: 0.8, risk: "high" },
      events: [],
    });

    // Overlay with undefined should not null-out computed fields
    const result = await store.setOverlay<TestState>("wf-1", "run-1", {
      risk: "low",
      score: undefined,
    } as any);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.overlay).toEqual({ risk: "low" });
    const effective = effectiveState(result.value as StateSnapshot<TestState>);
    expect(effective.score).toBe(0.8);
  });

  it("load<T> returns typed snapshot", async () => {
    const store = createMemoryStore();
    await store.commit<TestState>({
      workflowId: "wf-1",
      runId: "run-1",
      stepId: "step-1",
      expectedVersion: 0,
      delta: { score: 0.8, risk: "high" },
      events: [],
    });

    // Typed load: computed carries TestState
    const typed = await store.load<TestState>("wf-1", "run-1");
    if (typed.ok && typed.value) {
      expectTypeOf(typed.value.computed).toEqualTypeOf<TestState>();
      expectTypeOf(typed.value.overlay).toEqualTypeOf<Partial<TestState>>();
    }

    // Untyped load: defaults to unknown
    const untyped = await store.load("wf-1", "run-1");
    if (untyped.ok && untyped.value) {
      expectTypeOf(untyped.value.computed).toEqualTypeOf<unknown>();
    }
  });

  it("load returns a clone (mutations do not affect store)", async () => {
    const store = createMemoryStore();
    await store.commit({
      workflowId: "wf-1",
      runId: "run-1",
      stepId: "step-1",
      expectedVersion: 0,
      delta: { score: 0.8 },
      events: [],
    });

    const r1 = await store.load("wf-1", "run-1");
    if (!r1.ok || !r1.value) return;
    (r1.value.computed as any).score = 999;

    const r2 = await store.load("wf-1", "run-1");
    if (!r2.ok || !r2.value) return;
    expect((r2.value.computed as any).score).toBe(0.8);
  });
});
