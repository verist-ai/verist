// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import type { Artifact } from "./artifact.ts";
import { createContextFactory } from "./context.ts";
import { run, runStep } from "./run.ts";
import { defineStep } from "./step.ts";

describe("runStep", () => {
  interface TestAdapters {
    db: { getValue(): number };
  }

  const mockAdapters: TestAdapters = {
    db: { getValue: () => 100 },
  };

  const testStep = defineStep({
    name: "test",
    input: z.object({ input: z.number() }),
    delta: z.object({ output: z.number() }),
    run: async (input: { input: number }, ctx: { adapters: TestAdapters }) => ({
      delta: { output: input.input + ctx.adapters.db.getValue() },
      events: [{ type: "computed", payload: { input: input.input } }],
    }),
  });

  it("executes step successfully", async () => {
    const result = await runStep({
      step: testStep,
      input: { input: 5 },
      contextFactory: createContextFactory(mockAdapters),
      workflowId: "test-workflow",
      workflowVersion: "1.0.0",
      runId: "run-123",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.input).toEqual({ input: 5 });
      expect(result.value.output.delta).toEqual({ output: 105 });
      expect(result.value.output.events).toEqual([
        { type: "computed", payload: { input: 5 } },
      ]);
      expect(result.value.stepName).toBe("test");
      expect(result.value.workflowId).toBe("test-workflow");
      expect(result.value.workflowVersion).toBe("1.0.0");
      expect(result.value.runId).toBe("run-123");
    }
  });

  it("returns INPUT_VALIDATION error for invalid input", async () => {
    const result = await runStep({
      step: testStep,
      input: { input: "not a number" } as unknown as { input: number },
      contextFactory: createContextFactory(mockAdapters),
      workflowId: "test-workflow",
      workflowVersion: "1.0.0",
      runId: "run-123",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INPUT_VALIDATION");
    }
  });

  it("returns EXECUTION error for thrown errors", async () => {
    const failingStep = defineStep({
      name: "failing",
      input: z.object({ x: z.number() }),
      delta: z.object({ y: z.number() }),
      run: async () => {
        throw new Error("step failed");
      },
    });

    const result = await runStep({
      step: failingStep,
      input: { x: 1 },
      contextFactory: createContextFactory({}),
      workflowId: "test",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("EXECUTION");
      expect(result.error.message).toBe("step failed");
    }
  });

  it("returns OUTPUT_VALIDATION error for invalid output", async () => {
    const badOutputStep = defineStep({
      name: "bad-output",
      input: z.object({ x: z.number() }),
      delta: z.object({ y: z.number() }),
      run: async () => ({
        delta: { y: "not a number" } as unknown as { y: number },
        events: [],
      }),
    });

    const result = await runStep({
      step: badOutputStep,
      input: { x: 1 },
      contextFactory: createContextFactory({}),
      workflowId: "test",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("OUTPUT_VALIDATION");
    }
  });

  it("allows partial output delta", async () => {
    const partialStep = defineStep({
      name: "partial",
      input: z.object({ x: z.number() }),
      delta: z.object({ a: z.number(), b: z.number() }),
      run: async () => ({
        delta: { a: 1 }, // b is not included
        events: [],
      }),
    });

    const result = await runStep({
      step: partialStep,
      input: { x: 1 },
      contextFactory: createContextFactory({}),
      workflowId: "test",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output.delta).toEqual({ a: 1 });
    }
  });
});

describe("run", () => {
  const simpleStep = defineStep({
    name: "greet",
    input: z.object({ name: z.string() }),
    delta: z.object({ greeting: z.string() }),
    run: async (input) => ({
      delta: { greeting: `Hello, ${input.name}!` },
      events: [{ type: "greeted", payload: { name: input.name } }],
    }),
  });

  it("executes step with minimal config", async () => {
    const result = await run(simpleStep, { name: "World" }, { adapters: {} });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output.delta).toEqual({ greeting: "Hello, World!" });
      expect(result.value.stepName).toBe("greet");
      // Defaults: workflowId = step.name, workflowVersion = "0.0.0"
      expect(result.value.workflowId).toBe("greet");
      expect(result.value.workflowVersion).toBe("0.0.0");
      // runId should be a UUID
      expect(result.value.runId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
  });

  it("allows overriding defaults", async () => {
    const result = await run(
      simpleStep,
      { name: "Test" },
      {
        adapters: {},
        workflowId: "custom-workflow",
        workflowVersion: "2.0.0",
        runId: "custom-run-id",
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.workflowId).toBe("custom-workflow");
      expect(result.value.workflowVersion).toBe("2.0.0");
      expect(result.value.runId).toBe("custom-run-id");
    }
  });

  it("passes adapters to step context", async () => {
    interface MyAdapters {
      prefix: string;
    }

    const stepWithAdapters = defineStep({
      name: "prefixed",
      input: z.object({ text: z.string() }),
      delta: z.object({ result: z.string() }),
      run: async (input, ctx: { adapters: MyAdapters }) => ({
        delta: { result: `${ctx.adapters.prefix}${input.text}` },
        events: [],
      }),
    });

    const result = await run(
      stepWithAdapters,
      { text: "test" },
      { adapters: { prefix: ">>>" } },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output.delta).toEqual({ result: ">>>test" });
    }
  });

  it("includes validated input in result", async () => {
    const result = await run(simpleStep, { name: "Test" }, { adapters: {} });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.input).toEqual({ name: "Test" });
    }
  });

  it("passes commands through", async () => {
    const stepWithCommands = defineStep({
      name: "with-commands",
      input: z.object({ id: z.string() }),
      delta: z.object({ processed: z.boolean() }),
      run: async (input) => ({
        delta: { processed: true },
        events: [],
        commands: [
          { type: "invoke", step: "next", input: { id: input.id } },
          { type: "emit", topic: "done", payload: {} },
        ],
      }),
    });

    const result = await run(stepWithCommands, { id: "123" }, { adapters: {} });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output.commands).toEqual([
        { type: "invoke", step: "next", input: { id: "123" } },
        { type: "emit", topic: "done", payload: {} },
      ]);
    }
  });

  describe("onArtifact callback", () => {
    const artifactStep = defineStep({
      name: "artifact-test",
      input: z.object({ value: z.number() }),
      delta: z.object({ doubled: z.number() }),
      run: async (input) => ({
        delta: { doubled: input.value * 2 },
        events: [{ type: "doubled", payload: { original: input.value } }],
      }),
    });

    it("emits step-output artifact when callback is provided", async () => {
      const artifacts: Artifact[] = [];

      const result = await run(
        artifactStep,
        { value: 5 },
        {
          adapters: {},
          onArtifact: (artifact) => artifacts.push(artifact),
        },
      );

      expect(result.ok).toBe(true);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0]!.kind).toBe("step-output");

      const expectedContent = {
        delta: { doubled: 10 },
        events: [{ type: "doubled", payload: { original: 5 } }],
      };
      expect(artifacts[0]!.content).toEqual(expectedContent);

      // Hash must match the validated output (not raw/pre-validation)
      const { hashValue } = await import("./artifact.ts");
      expect(artifacts[0]!.hash).toBe(await hashValue(expectedContent));
    });

    it("does not emit artifact when callback is not provided", async () => {
      const result = await run(artifactStep, { value: 5 }, { adapters: {} });

      expect(result.ok).toBe(true);
      // No way to verify no artifact was emitted, but test shouldn't throw
    });

    it("passes onArtifact to context for adapters", async () => {
      const artifacts: Artifact[] = [];
      let contextOnArtifact: ((artifact: Artifact) => void) | undefined;

      const adapterStep = defineStep({
        name: "adapter-test",
        input: z.object({ x: z.number() }),
        delta: z.object({ y: z.number() }),
        run: async (input, ctx) => {
          contextOnArtifact = ctx.onArtifact;
          // Simulate adapter emitting an artifact
          if (ctx.onArtifact) {
            ctx.onArtifact({
              hash: "sha256:mock",
              kind: "llm-output",
              content: { response: "mocked" },
            });
          }
          return { delta: { y: input.x }, events: [] };
        },
      });

      await run(
        adapterStep,
        { x: 1 },
        {
          adapters: {},
          onArtifact: (artifact) => artifacts.push(artifact),
        },
      );

      expect(contextOnArtifact).toBeDefined();
      // Adapter artifact + step-output = 2 artifacts
      expect(artifacts).toHaveLength(2);
      // Adapter artifacts emitted during execution come first,
      // step-output emitted after step completes
      expect(artifacts[0]!.kind).toBe("llm-output");
      expect(artifacts[1]!.kind).toBe("step-output");
    });
  });
});
