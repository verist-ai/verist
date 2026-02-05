// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { hashValue } from "./artifact.ts";
import { emit, invoke, review } from "./command.ts";
import type { StepResult } from "./run.ts";
import {
  captureArtifact,
  createSnapshot,
  createSnapshotFromResult,
  RESERVED_ARTIFACT_KINDS,
} from "./snapshot.ts";

describe("captureArtifact", () => {
  it("creates artifact with hash and content", async () => {
    const content = { text: "Hello, world!" };
    const artifact = await captureArtifact("llm-output", content);

    expect(artifact.hash).toBe(await hashValue(content));
    expect(artifact.kind).toBe("llm-output");
    expect(artifact.content).toEqual(content);
  });

  it("supports different artifact kinds", async () => {
    const a1 = await captureArtifact("llm-input", { prompt: "test" });
    const a2 = await captureArtifact("step-input", { id: 1 });
    const a3 = await captureArtifact("step-output", { result: true });
    const a4 = await captureArtifact("custom-kind", { data: [] });

    expect(a1.kind).toBe("llm-input");
    expect(a2.kind).toBe("step-input");
    expect(a3.kind).toBe("step-output");
    expect(a4.kind).toBe("custom-kind");
  });

  it("omits content when hashOnly is true", async () => {
    const content = { sensitive: "data" };
    const artifact = await captureArtifact("llm-output", content, {
      hashOnly: true,
    });

    expect(artifact.hash).toBe(await hashValue(content));
    expect(artifact.kind).toBe("llm-output");
    expect(artifact.content).toBeUndefined();
  });

  it("includes content when hashOnly is false", async () => {
    const content = { data: "value" };
    const artifact = await captureArtifact("llm-output", content, {
      hashOnly: false,
    });

    expect(artifact.content).toEqual(content);
  });
});

describe("createSnapshot", () => {
  let originalDateNow: () => number;

  beforeEach(() => {
    originalDateNow = Date.now;
    Date.now = () => 1700000000000;
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  it("creates snapshot with all fields", async () => {
    const input = { documentId: "doc-123" };
    const artifacts = [
      await captureArtifact("llm-output", { response: "test" }),
    ];

    const snapshot = await createSnapshot({
      workflowId: "verify-doc",
      workflowVersion: "1.0.0",
      stepName: "extract",
      input,
      artifacts,
    });

    expect(snapshot.workflowId).toBe("verify-doc");
    expect(snapshot.workflowVersion).toBe("1.0.0");
    expect(snapshot.stepName).toBe("extract");
    expect(snapshot.input).toEqual(input);
    expect(snapshot.inputHash).toBe(await hashValue(input));
    expect(snapshot.artifacts).toEqual(artifacts);
    expect(snapshot.capturedAt).toBe(1700000000000);
  });

  it("computes inputHash from input", async () => {
    const input = { a: 1, b: 2 };
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input,
      artifacts: [],
    });

    expect(snapshot.inputHash).toBe(await hashValue(input));
  });

  it("handles empty artifacts array", async () => {
    const snapshot = await createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input: {},
      artifacts: [],
    });

    expect(snapshot.artifacts).toEqual([]);
  });
});

describe("createSnapshotFromResult", () => {
  let originalDateNow: () => number;

  beforeEach(() => {
    originalDateNow = Date.now;
    Date.now = () => 1700000000000;
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  it("creates snapshot from step result", async () => {
    const result: StepResult<{ id: string }, { score: number }> = {
      input: { id: "doc-123" },
      output: {
        delta: { score: 0.95 },
        events: [{ type: "scored" }],
      },
      stepName: "score",
      workflowId: "verify-doc",
      workflowVersion: "1.2.0",
      runId: "run-456",
      artifacts: [],
    };

    const snapshot = await createSnapshotFromResult(result);

    expect(snapshot.workflowId).toBe("verify-doc");
    expect(snapshot.workflowVersion).toBe("1.2.0");
    expect(snapshot.stepName).toBe("score");
    expect(snapshot.input).toEqual({ id: "doc-123" });
    expect(snapshot.inputHash).toBe(await hashValue({ id: "doc-123" }));
    expect(snapshot.capturedAt).toBe(1700000000000);

    // Includes step output as artifact
    expect(snapshot.artifacts).toHaveLength(1);
    const artifact = snapshot.artifacts[0]!;
    expect(artifact.kind).toBe("step-output");
    expect(artifact.content).toEqual(result.output);
  });

  it("supports outputHashOnly mode for compliance", async () => {
    const result: StepResult<{ id: string }, { data: string }> = {
      input: { id: "sensitive" },
      output: {
        delta: { data: "secret" },
        events: [],
      },
      artifacts: [],
      stepName: "process",
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    };

    const snapshot = await createSnapshotFromResult(result, {
      outputHashOnly: true,
    });

    // Hash present, content omitted
    const artifact = snapshot.artifacts[0]!;
    expect(artifact.hash).toBe(await hashValue(result.output));
    expect(artifact.content).toBeUndefined();
  });

  it("includes additional artifacts", async () => {
    const result: StepResult<{ id: string }, { summary: string }> = {
      input: { id: "doc" },
      output: {
        delta: { summary: "A summary" },
        events: [],
      },
      artifacts: [],
      stepName: "summarize",
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    };

    const llmArtifact = await captureArtifact("llm-output", {
      response: "LLM text",
    });
    const snapshot = await createSnapshotFromResult(result, {
      artifacts: [llmArtifact],
    });

    expect(snapshot.artifacts).toHaveLength(2);
    expect(snapshot.artifacts[0]!.kind).toBe("step-output");
    expect(snapshot.artifacts[1]!.kind).toBe("llm-output");
  });

  it("auto-captures commands when present", async () => {
    const result: StepResult<{ id: string }, { status: string }> = {
      input: { id: "doc-123" },
      output: {
        delta: { status: "processing" },
        events: [],
        commands: [invoke("next", { id: "doc-123" })],
      },
      artifacts: [],
      stepName: "process",
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    };

    const snapshot = await createSnapshotFromResult(result);

    expect(snapshot.artifacts).toHaveLength(2);
    expect(snapshot.artifacts[0]!.kind).toBe("step-output");
    expect(snapshot.artifacts[1]!.kind).toBe("step-commands");
    expect(snapshot.artifacts[1]!.content).toEqual([
      invoke("next", { id: "doc-123" }),
    ]);
  });

  it("suppresses command capture with captureCommands: false", async () => {
    const result: StepResult<{ id: string }, { status: string }> = {
      input: { id: "doc-123" },
      output: {
        delta: { status: "processing" },
        events: [],
        commands: [invoke("next", { id: "doc-123" })],
      },
      artifacts: [],
      stepName: "process",
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    };

    const snapshot = await createSnapshotFromResult(result, {
      captureCommands: false,
    });

    expect(snapshot.artifacts).toHaveLength(1);
    expect(snapshot.artifacts[0]!.kind).toBe("step-output");
  });

  it("does not produce step-commands artifact for empty commands", async () => {
    const result: StepResult<{ id: string }, { status: string }> = {
      input: { id: "doc-123" },
      output: {
        delta: { status: "done" },
        events: [],
        commands: [],
      },
      artifacts: [],
      stepName: "process",
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    };

    const snapshot = await createSnapshotFromResult(result);

    expect(snapshot.artifacts).toHaveLength(1);
    expect(snapshot.artifacts[0]!.kind).toBe("step-output");
  });

  it("supports commandsHashOnly mode", async () => {
    const result: StepResult<{ id: string }, { status: string }> = {
      input: { id: "doc-123" },
      output: {
        delta: { status: "processing" },
        events: [],
        commands: [invoke("next", { id: "doc-123" })],
      },
      artifacts: [],
      stepName: "process",
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    };

    const snapshot = await createSnapshotFromResult(result, {
      commandsHashOnly: true,
    });

    const commandsArtifact = snapshot.artifacts.find(
      (a) => a.kind === "step-commands",
    );
    expect(commandsArtifact).toBeDefined();
    expect(commandsArtifact!.hash).toMatch(/^sha256:/);
    expect(commandsArtifact!.content).toBeUndefined();
  });

  it("throws on reserved artifact kind in options.artifacts", async () => {
    const result: StepResult<{ id: string }, { status: string }> = {
      input: { id: "doc-123" },
      output: { delta: { status: "done" }, events: [] },
      artifacts: [],
      stepName: "process",
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    };

    for (const kind of RESERVED_ARTIFACT_KINDS) {
      const reserved = await captureArtifact(kind, { data: "test" });
      await expect(
        createSnapshotFromResult(result, { artifacts: [reserved] }),
      ).rejects.toThrow(`Artifact kind "${kind}" is reserved by the kernel.`);
    }
  });

  it("allows custom artifact kinds in options.artifacts", async () => {
    const result: StepResult<{ id: string }, { status: string }> = {
      input: { id: "doc-123" },
      output: { delta: { status: "done" }, events: [] },
      artifacts: [],
      stepName: "process",
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    };

    const custom = await captureArtifact("llm-output", { data: "test" });
    const snapshot = await createSnapshotFromResult(result, {
      artifacts: [custom],
    });

    expect(snapshot.artifacts).toHaveLength(2);
    expect(snapshot.artifacts[1]!.kind).toBe("llm-output");
  });

  it("normalizes commands for consistent hashing", async () => {
    const result1: StepResult<{ id: string }, { status: string }> = {
      input: { id: "doc-123" },
      output: {
        delta: { status: "done" },
        events: [],
        commands: [invoke("b", {}), invoke("a", {})],
      },
      artifacts: [],
      stepName: "process",
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    };

    const result2: StepResult<{ id: string }, { status: string }> = {
      input: { id: "doc-123" },
      output: {
        delta: { status: "done" },
        events: [],
        commands: [invoke("a", {}), invoke("b", {})],
      },
      artifacts: [],
      stepName: "process",
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-2",
    };

    const snapshot1 = await createSnapshotFromResult(result1);
    const snapshot2 = await createSnapshotFromResult(result2);

    const hash1 = snapshot1.artifacts.find(
      (a) => a.kind === "step-commands",
    )?.hash;
    const hash2 = snapshot2.artifacts.find(
      (a) => a.kind === "step-commands",
    )?.hash;

    // Same commands in different order → same hash after normalization
    expect(hash1).toBe(hash2);
  });

  it("normalizes mixed command types for consistent hashing", async () => {
    const commands1 = [
      review("check totals"),
      invoke("enrich", { id: 1 }),
      emit("doc.processed", { id: 1 }),
      invoke("validate", { id: 1 }),
    ];

    const commands2 = [
      invoke("validate", { id: 1 }),
      emit("doc.processed", { id: 1 }),
      invoke("enrich", { id: 1 }),
      review("check totals"),
    ];

    const make = (cmds: typeof commands1, runId: string) =>
      createSnapshotFromResult({
        input: { id: "doc-1" },
        output: { delta: { status: "done" }, events: [], commands: cmds },
        artifacts: [],
        stepName: "process",
        workflowId: "wf",
        workflowVersion: "1.0.0",
        runId,
      } as StepResult<{ id: string }, { status: string }>);

    const snapshot1 = await make(commands1, "run-1");
    const snapshot2 = await make(commands2, "run-2");

    const hash1 = snapshot1.artifacts.find(
      (a) => a.kind === "step-commands",
    )?.hash;
    const hash2 = snapshot2.artifacts.find(
      (a) => a.kind === "step-commands",
    )?.hash;

    expect(hash1).toBe(hash2);
  });
});
