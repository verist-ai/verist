import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { StepResult } from "@verist/core";
import {
  captureArtifact,
  createSnapshot,
  createSnapshotFromResult,
} from "./artifact.ts";
import { hashValue } from "./hash.ts";

describe("captureArtifact", () => {
  it("creates artifact with hash and content", () => {
    const content = { text: "Hello, world!" };
    const artifact = captureArtifact("llm-output", content);

    expect(artifact.hash).toBe(hashValue(content));
    expect(artifact.kind).toBe("llm-output");
    expect(artifact.content).toEqual(content);
  });

  it("supports different artifact kinds", () => {
    const a1 = captureArtifact("llm-input", { prompt: "test" });
    const a2 = captureArtifact("step-input", { id: 1 });
    const a3 = captureArtifact("step-output", { result: true });
    const a4 = captureArtifact("custom-kind", { data: [] });

    expect(a1.kind).toBe("llm-input");
    expect(a2.kind).toBe("step-input");
    expect(a3.kind).toBe("step-output");
    expect(a4.kind).toBe("custom-kind");
  });

  it("omits content when hashOnly is true", () => {
    const content = { sensitive: "data" };
    const artifact = captureArtifact("llm-output", content, { hashOnly: true });

    expect(artifact.hash).toBe(hashValue(content));
    expect(artifact.kind).toBe("llm-output");
    expect(artifact.content).toBeUndefined();
  });

  it("includes content when hashOnly is false", () => {
    const content = { data: "value" };
    const artifact = captureArtifact("llm-output", content, {
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

  it("creates snapshot with all fields", () => {
    const input = { documentId: "doc-123" };
    const artifacts = [captureArtifact("llm-output", { response: "test" })];

    const snapshot = createSnapshot({
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
    expect(snapshot.inputHash).toBe(hashValue(input));
    expect(snapshot.artifacts).toEqual(artifacts);
    expect(snapshot.capturedAt).toBe(1700000000000);
  });

  it("computes inputHash from input", () => {
    const input = { a: 1, b: 2 };
    const snapshot = createSnapshot({
      workflowId: "wf",
      workflowVersion: "1.0.0",
      stepName: "step",
      input,
      artifacts: [],
    });

    expect(snapshot.inputHash).toBe(hashValue(input));
  });

  it("handles empty artifacts array", () => {
    const snapshot = createSnapshot({
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

  it("creates snapshot from step result", () => {
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
    };

    const snapshot = createSnapshotFromResult(result);

    expect(snapshot.workflowId).toBe("verify-doc");
    expect(snapshot.workflowVersion).toBe("1.2.0");
    expect(snapshot.stepName).toBe("score");
    expect(snapshot.input).toEqual({ id: "doc-123" });
    expect(snapshot.inputHash).toBe(hashValue({ id: "doc-123" }));
    expect(snapshot.capturedAt).toBe(1700000000000);

    // Includes step output as artifact
    expect(snapshot.artifacts).toHaveLength(1);
    const artifact = snapshot.artifacts[0]!;
    expect(artifact.kind).toBe("step-output");
    expect(artifact.content).toEqual(result.output);
  });

  it("supports hashOnly mode for compliance", () => {
    const result: StepResult<{ id: string }, { data: string }> = {
      input: { id: "sensitive" },
      output: {
        delta: { data: "secret" },
        events: [],
      },
      stepName: "process",
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    };

    const snapshot = createSnapshotFromResult(result, { hashOnly: true });

    // Hash present, content omitted
    const artifact = snapshot.artifacts[0]!;
    expect(artifact.hash).toBe(hashValue(result.output));
    expect(artifact.content).toBeUndefined();
  });

  it("includes additional artifacts", () => {
    const result: StepResult<{ id: string }, { summary: string }> = {
      input: { id: "doc" },
      output: {
        delta: { summary: "A summary" },
        events: [],
      },
      stepName: "summarize",
      workflowId: "wf",
      workflowVersion: "1.0.0",
      runId: "run-1",
    };

    const llmArtifact = captureArtifact("llm-output", { response: "LLM text" });
    const snapshot = createSnapshotFromResult(result, {
      artifacts: [llmArtifact],
    });

    expect(snapshot.artifacts).toHaveLength(2);
    expect(snapshot.artifacts[0]!.kind).toBe("step-output");
    expect(snapshot.artifacts[1]!.kind).toBe("llm-output");
  });
});
