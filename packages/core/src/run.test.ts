import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { defineStep } from "./step.ts";
import { runStep, run } from "./run.ts";
import { createContextFactory } from "./context.ts";

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
});
