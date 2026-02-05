// SPDX-License-Identifier: Apache-2.0

import { describe, expect, expectTypeOf, it } from "bun:test";
import { z } from "zod";
import type { Artifact } from "./artifact.ts";
import type { StepContext } from "./context.ts";
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
    output: z.object({ output: z.number() }),
    run: async (input, ctx: StepContext<TestAdapters>) => ({
      output: { output: input.input + ctx.adapters.db.getValue() },
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
      expect(result.value.output).toEqual({ output: 105 });
      expect(result.value.events).toEqual([
        { type: "computed", payload: { input: 5 } },
      ]);
      expect(result.value.stepName).toBe("test");
      expect(result.value.workflowId).toBe("test-workflow");
      expect(result.value.workflowVersion).toBe("1.0.0");
      expect(result.value.runId).toBe("run-123");
    }
  });

  it("returns input_validation error for invalid input", async () => {
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
      expect(result.error.code).toBe("input_validation");
    }
  });

  it("returns execution_failed error for thrown errors", async () => {
    const failingStep = defineStep({
      name: "failing",
      input: z.object({ x: z.number() }),
      output: z.object({ y: z.number() }),
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
      expect(result.error.code).toBe("execution_failed");
      expect(result.error.message).toBe("step failed");
    }
  });

  it("returns output_validation error for invalid output", async () => {
    const badOutputStep = defineStep({
      name: "bad-output",
      input: z.object({ x: z.number() }),
      output: z.object({ y: z.number() }),
      run: async () => ({
        output: { y: "not a number" } as unknown as { y: number },
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
      expect(result.error.code).toBe("output_validation");
    }
  });

  it("infers adapter types from ctx annotation", () => {
    defineStep({
      name: "typed-adapters",
      input: z.object({ x: z.number() }),
      output: z.object({ y: z.number() }),
      run: async (_input, ctx: StepContext<TestAdapters>) => {
        // Compile-time proof: ctx.adapters is inferred as TestAdapters
        expectTypeOf(ctx.adapters).toEqualTypeOf<TestAdapters>();
        expectTypeOf(ctx.adapters.db.getValue).toEqualTypeOf<() => number>();
        return { output: { y: 1 }, events: [] };
      },
    });
  });

  it("allows partial output", async () => {
    const partialStep = defineStep({
      name: "partial",
      input: z.object({ x: z.number() }),
      output: z.object({ a: z.number(), b: z.number() }),
      run: async () => ({
        output: { a: 1 }, // b is not included
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
      expect(result.value.output).toEqual({ a: 1 });
    }
  });
});

describe("run", () => {
  const simpleStep = defineStep({
    name: "greet",
    input: z.object({ name: z.string() }),
    output: z.object({ greeting: z.string() }),
    run: async (input) => ({
      output: { greeting: `Hello, ${input.name}!` },
      events: [{ type: "greeted", payload: { name: input.name } }],
    }),
  });

  it("executes step with minimal config", async () => {
    const result = await run(simpleStep, { name: "World" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expectTypeOf(result.value.output).toEqualTypeOf<
        Partial<{ greeting: string }>
      >();
      expect(result.value.output).toEqual({ greeting: "Hello, World!" });
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
      output: z.object({ result: z.string() }),
      run: async (input, ctx: StepContext<MyAdapters>) => ({
        output: { result: `${ctx.adapters.prefix}${input.text}` },
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
      expect(result.value.output).toEqual({ result: ">>>test" });
    }
  });

  it("includes validated input in result", async () => {
    const result = await run(simpleStep, { name: "Test" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.input).toEqual({ name: "Test" });
    }
  });

  it("passes commands through", async () => {
    const stepWithCommands = defineStep({
      name: "with-commands",
      input: z.object({ id: z.string() }),
      output: z.object({ processed: z.boolean() }),
      run: async (input) => ({
        output: { processed: true },
        events: [],
        commands: [
          { type: "invoke", step: "next", input: { id: input.id } },
          { type: "emit", topic: "done", payload: {} },
        ],
      }),
    });

    const result = await run(stepWithCommands, { id: "123" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.commands).toEqual([
        { type: "invoke", step: "next", input: { id: "123" } },
        { type: "emit", topic: "done", payload: {} },
      ]);
    }
  });

  describe("onArtifact callback", () => {
    it("forwards adapter-emitted artifacts to onArtifact callback", async () => {
      const callbackArtifacts: Artifact[] = [];

      const adapterStep = defineStep({
        name: "adapter-test",
        input: z.object({ x: z.number() }),
        output: z.object({ y: z.number() }),
        run: async (input, ctx) => {
          // Simulate adapter emitting an artifact
          ctx.onArtifact?.({
            hash: "sha256:mock",
            kind: "llm-output",
            content: { response: "mocked" },
          });
          return { output: { y: input.x }, events: [] };
        },
      });

      const result = await run(
        adapterStep,
        { x: 1 },
        {
          onArtifact: (artifact) => callbackArtifacts.push(artifact),
        },
      );

      expect(result.ok).toBe(true);
      expect(callbackArtifacts).toHaveLength(1);
      expect(callbackArtifacts[0]!.kind).toBe("llm-output");
    });
  });
});
