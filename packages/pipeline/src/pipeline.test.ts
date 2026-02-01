// SPDX-License-Identifier: Apache-2.0

import {
  createContextFactory,
  defineStep,
  emit,
  fanout,
  invoke,
  review,
  suspend,
} from "@verist/core";
import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { definePipeline, runPipeline } from "./pipeline.ts";

// Test steps
const parseDocument = defineStep({
  name: "parseDocument",
  input: z.object({ documentId: z.string() }),
  delta: z.object({ markdown: z.string(), wordCount: z.number() }),
  run: async (input) => ({
    delta: { markdown: `# Doc ${input.documentId}`, wordCount: 100 },
    events: [{ type: "document_parsed", payload: { id: input.documentId } }],
  }),
});

const extractClaims = defineStep({
  name: "extractClaims",
  input: z.object({ markdown: z.string() }),
  delta: z.object({ claims: z.array(z.string()) }),
  run: async (input) => ({
    delta: { claims: [`Claim from: ${input.markdown}`] },
    events: [{ type: "claims_extracted" }],
  }),
});

const verifyClaims = defineStep({
  name: "verifyClaims",
  input: z.object({ claims: z.array(z.string()) }),
  delta: z.object({ verified: z.boolean(), verifiedCount: z.number() }),
  run: async (input) => ({
    delta: { verified: true, verifiedCount: input.claims.length },
    events: [{ type: "claims_verified" }],
  }),
});

const failingStep = defineStep({
  name: "failingStep",
  input: z.object({ shouldFail: z.boolean() }),
  delta: z.object({ result: z.string() }),
  run: async (input) => {
    if (input.shouldFail) {
      throw new Error("Step failed intentionally");
    }
    return { delta: { result: "ok" }, events: [] };
  },
});

const suspendingStep = defineStep({
  name: "suspendingStep",
  input: z.object({ data: z.string() }),
  delta: z.object({ status: z.string() }),
  run: async (input) => ({
    delta: { status: "pending" },
    events: [],
    commands: [
      suspend({ reason: "awaiting_input", checkpoint: { data: input.data } }),
    ],
  }),
});

const reviewingStep = defineStep({
  name: "reviewingStep",
  input: z.object({ data: z.string() }),
  delta: z.object({ status: z.string() }),
  run: async (input) => ({
    delta: { status: "pending_review" },
    events: [],
    commands: [review("high_risk", { data: input.data })],
  }),
});

const invokingStep = defineStep({
  name: "invokingStep",
  input: z.object({ data: z.string() }),
  delta: z.object({ result: z.string() }),
  run: async () => ({
    delta: { result: "done" },
    events: [],
    commands: [invoke("otherStep", { foo: "bar" })],
  }),
});

const fanoutStep = defineStep({
  name: "fanoutStep",
  input: z.object({ data: z.string() }),
  delta: z.object({ result: z.string() }),
  run: async () => ({
    delta: { result: "done" },
    events: [],
    commands: [fanout("otherStep", [{ a: 1 }, { a: 2 }])],
  }),
});

const emittingStep = defineStep({
  name: "emittingStep",
  input: z.object({ data: z.string() }),
  delta: z.object({ result: z.string() }),
  run: async (input) => ({
    delta: { result: "emitted" },
    events: [],
    commands: [emit("notifications", { message: input.data })],
  }),
});

const contextFactory = createContextFactory({});

describe("definePipeline", () => {
  it("creates a pipeline with name, version, and stages", () => {
    const pipeline = definePipeline({
      name: "test-pipeline",
      version: "1.0.0",
      stages: [{ step: parseDocument }],
    });

    expect(pipeline.name).toBe("test-pipeline");
    expect(pipeline.version).toBe("1.0.0");
    expect(pipeline.stages).toHaveLength(1);
    expect(pipeline.stages[0]!.step.name).toBe("parseDocument");
  });
});

describe("runPipeline", () => {
  it("executes all stages and returns final delta as output", async () => {
    const pipeline = definePipeline({
      name: "process-document",
      version: "1.0.0",
      stages: [
        { step: parseDocument },
        {
          step: extractClaims,
          wire: (prev: any) => ({ markdown: prev.markdown }),
        },
        { step: verifyClaims, wire: (prev: any) => ({ claims: prev.claims }) },
      ],
    });

    const result = await runPipeline({
      pipeline,
      input: { documentId: "doc-123" },
      contextFactory,
      workflowId: "test-workflow",
      runId: "run-1",
    });

    expect(result.ok).toBe(true);
    expect(result.runId).toBe("run-1");
    expect(result.stages).toHaveLength(3);
    expect(result.output).toEqual({ verified: true, verifiedCount: 1 });
    expect(result.error).toBeUndefined();
    expect(result.suspendedAt).toBeUndefined();
    for (const s of result.stages) expect(s.blockedBy).toBeUndefined();
  });

  it("collects events from all stages", async () => {
    const pipeline = definePipeline({
      name: "events-test",
      version: "1.0.0",
      stages: [
        { step: parseDocument },
        {
          step: extractClaims,
          wire: (prev: any) => ({ markdown: prev.markdown }),
        },
      ],
    });

    const result = await runPipeline({
      pipeline,
      input: { documentId: "doc-456" },
      contextFactory,
      workflowId: "test",
      runId: "run-events",
    });

    expect(result.ok).toBe(true);
    expect(result.stages[0]!.events).toEqual([
      { type: "document_parsed", payload: { id: "doc-456" } },
    ]);
    expect(result.stages[1]!.events).toEqual([{ type: "claims_extracted" }]);
  });

  it("tracks duration per stage", async () => {
    const slowStep = defineStep({
      name: "slowStep",
      input: z.object({}),
      delta: z.object({ done: z.boolean() }),
      run: async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { delta: { done: true }, events: [] };
      },
    });

    const pipeline = definePipeline({
      name: "duration-test",
      version: "1.0.0",
      stages: [{ step: slowStep }],
    });

    const result = await runPipeline({
      pipeline,
      input: {},
      contextFactory,
      workflowId: "test",
      runId: "run-duration",
    });

    expect(result.ok).toBe(true);
    expect(result.stages[0]!.durationMs).toBeGreaterThanOrEqual(50);
  });

  describe("wiring", () => {
    it("first stage receives pipeline input when no wire function", async () => {
      const captureStep = defineStep({
        name: "captureStep",
        input: z.object({ documentId: z.string() }),
        delta: z.object({ captured: z.string() }),
        run: async (input) => ({
          delta: { captured: input.documentId },
          events: [],
        }),
      });

      const pipeline = definePipeline({
        name: "wire-test-first",
        version: "1.0.0",
        stages: [{ step: captureStep }],
      });

      const result = await runPipeline({
        pipeline,
        input: { documentId: "input-123" },
        contextFactory,
        workflowId: "test",
        runId: "run-wire-1",
      });

      expect(result.ok).toBe(true);
      expect(result.output).toEqual({ captured: "input-123" });
    });

    it("subsequent stages receive previous delta when no wire function", async () => {
      const stepA = defineStep({
        name: "stepA",
        input: z.object({ x: z.number() }),
        delta: z.object({ y: z.number() }),
        run: async (input) => ({
          delta: { y: input.x * 2 },
          events: [],
        }),
      });

      const stepB = defineStep({
        name: "stepB",
        input: z.object({ y: z.number() }),
        delta: z.object({ z: z.number() }),
        run: async (input) => ({
          delta: { z: input.y + 1 },
          events: [],
        }),
      });

      const pipeline = definePipeline({
        name: "wire-test-chain",
        version: "1.0.0",
        stages: [{ step: stepA }, { step: stepB }],
      });

      const result = await runPipeline({
        pipeline,
        input: { x: 5 },
        contextFactory,
        workflowId: "test",
        runId: "run-wire-2",
      });

      expect(result.ok).toBe(true);
      expect(result.stages[0]!.delta).toEqual({ y: 10 });
      expect(result.stages[1]!.delta).toEqual({ z: 11 });
      expect(result.output).toEqual({ z: 11 });
    });

    it("wire function transforms data between stages", async () => {
      const pipeline = definePipeline({
        name: "wire-transform",
        version: "1.0.0",
        stages: [
          { step: parseDocument },
          {
            step: extractClaims,
            wire: (prev: any, _input) => ({
              markdown: prev.markdown.toUpperCase(),
            }),
          },
        ],
      });

      const result = await runPipeline({
        pipeline,
        input: { documentId: "doc-transform" },
        contextFactory,
        workflowId: "test",
        runId: "run-wire-3",
      });

      expect(result.ok).toBe(true);
      // extractClaims received uppercased markdown
      expect(result.stages[1]!.delta).toEqual({
        claims: ["Claim from: # DOC DOC-TRANSFORM"],
      });
    });

    it("wire function can access both previous delta and pipeline input", async () => {
      const combineStep = defineStep({
        name: "combineStep",
        input: z.object({ combined: z.string() }),
        delta: z.object({ result: z.string() }),
        run: async (input) => ({
          delta: { result: input.combined },
          events: [],
        }),
      });

      const pipeline = definePipeline({
        name: "wire-both",
        version: "1.0.0",
        stages: [
          { step: parseDocument },
          {
            step: combineStep,
            wire: (prev: any, input: any) => ({
              combined: `${input.documentId}:${prev.wordCount}`,
            }),
          },
        ],
      });

      const result = await runPipeline({
        pipeline,
        input: { documentId: "doc-abc" },
        contextFactory,
        workflowId: "test",
        runId: "run-wire-4",
      });

      expect(result.ok).toBe(true);
      expect(result.output).toEqual({ result: "doc-abc:100" });
    });
  });

  describe("error handling", () => {
    it("stops on error with fail policy (default)", async () => {
      const pipeline = definePipeline({
        name: "error-fail",
        version: "1.0.0",
        stages: [
          { step: parseDocument },
          { step: failingStep, wire: () => ({ shouldFail: true }) },
          { step: verifyClaims, wire: () => ({ claims: [] }) },
        ],
      });

      const result = await runPipeline({
        pipeline,
        input: { documentId: "doc-error" },
        contextFactory,
        workflowId: "test",
        runId: "run-error-1",
      });

      expect(result.ok).toBe(false);
      expect(result.stages).toHaveLength(2);
      expect(result.stages[0]!.status).toBe("completed");
      expect(result.stages[1]!.status).toBe("failed");
      expect(result.error).toBeDefined();
      expect(result.error!.stepName).toBe("failingStep");
      expect(result.error!.code).toBe("EXECUTION");
      expect(result.error!.message).toBe("Step failed intentionally");
      expect(result.output).toBeUndefined();
    });

    it("continues past error and preserves previous delta with continue policy", async () => {
      const pipeline = definePipeline({
        name: "error-continue",
        version: "1.0.0",
        stages: [
          { step: parseDocument },
          {
            step: failingStep,
            wire: () => ({ shouldFail: true }),
            onError: "continue",
          },
          {
            step: extractClaims,
            wire: (prev: any) => ({ markdown: prev.markdown }),
          },
        ],
      });

      const result = await runPipeline({
        pipeline,
        input: { documentId: "doc-continue" },
        contextFactory,
        workflowId: "test",
        runId: "run-error-2",
      });

      expect(result.ok).toBe(true);
      expect(result.stages).toHaveLength(3);
      expect(result.stages[0]!.status).toBe("completed");
      expect(result.stages[0]!.blockedBy).toBeUndefined();
      expect(result.stages[1]!.status).toBe("continued");
      expect(result.stages[1]!.blockedBy).toBeUndefined();
      expect(result.stages[1]!.delta).toEqual({
        markdown: "# Doc doc-continue",
        wordCount: 100,
      });
      expect(result.stages[2]!.status).toBe("completed");
      expect(result.stages[2]!.blockedBy).toBeUndefined();
    });

    it("records error info on continued stages", async () => {
      const pipeline = definePipeline({
        name: "error-continue-info",
        version: "1.0.0",
        stages: [
          {
            step: failingStep,
            onError: "continue",
          },
        ],
      });

      const result = await runPipeline({
        pipeline,
        input: { shouldFail: true },
        contextFactory,
        workflowId: "test",
        runId: "run-continue-info",
      });

      expect(result.ok).toBe(true);
      expect(result.stages[0]!.status).toBe("continued");
      // First-stage continue: delta reflects what subsequent stages receive (pipeline input)
      expect(result.stages[0]!.delta).toEqual({ shouldFail: true });
      expect(result.stages[0]!.error).toBeDefined();
      expect(result.stages[0]!.error!.stepName).toBe("failingStep");
      expect(result.stages[0]!.error!.code).toBe("EXECUTION");
      expect(result.stages[0]!.error!.message).toBe(
        "Step failed intentionally",
      );
      // Verify pipeline_stage_error audit event is emitted
      expect(result.stages[0]!.events).toHaveLength(1);
      expect(result.stages[0]!.events[0]).toEqual({
        type: "pipeline_stage_error",
        payload: {
          stepName: "failingStep",
          code: "EXECUTION",
          message: "Step failed intentionally",
          continued: true,
        },
      });
    });

    it("records input validation errors as failed", async () => {
      const strictStep = defineStep({
        name: "strictStep",
        input: z.object({ value: z.number().positive() }),
        delta: z.object({ result: z.number() }),
        run: async (input) => ({
          delta: { result: input.value },
          events: [],
        }),
      });

      const pipeline = definePipeline({
        name: "validation-error",
        version: "1.0.0",
        stages: [{ step: strictStep }],
      });

      const result = await runPipeline({
        pipeline,
        input: { value: -5 },
        contextFactory,
        workflowId: "test",
        runId: "run-validation",
      });

      expect(result.ok).toBe(false);
      expect(result.error!.code).toBe("INPUT_VALIDATION");
    });

    it("records error info on failed stages", async () => {
      const pipeline = definePipeline({
        name: "error-fail-info",
        version: "1.0.0",
        stages: [{ step: failingStep }],
      });

      const result = await runPipeline({
        pipeline,
        input: { shouldFail: true },
        contextFactory,
        workflowId: "test",
        runId: "run-fail-info",
      });

      expect(result.ok).toBe(false);
      expect(result.stages[0]!.status).toBe("failed");
      expect(result.stages[0]!.blockedBy).toBeUndefined();
      expect(result.stages[0]!.error).toBeDefined();
      expect(result.stages[0]!.error!.stepName).toBe("failingStep");
      expect(result.stages[0]!.error!.code).toBe("EXECUTION");
      expect(result.stages[0]!.error!.message).toBe(
        "Step failed intentionally",
      );
      // Error is also on PipelineResult
      expect(result.error).toEqual(result.stages[0]!.error);
    });
  });

  describe("blocking commands", () => {
    it("stops on suspend command", async () => {
      const pipeline = definePipeline({
        name: "suspend-test",
        version: "1.0.0",
        stages: [
          { step: parseDocument },
          { step: suspendingStep, wire: () => ({ data: "test" }) },
          { step: verifyClaims, wire: () => ({ claims: [] }) },
        ],
      });

      const result = await runPipeline({
        pipeline,
        input: { documentId: "doc-suspend" },
        contextFactory,
        workflowId: "test",
        runId: "run-suspend",
      });

      expect(result.ok).toBe(false);
      expect(result.stages).toHaveLength(2);
      expect(result.stages[0]!.status).toBe("completed");
      expect(result.stages[1]!.status).toBe("suspended");
      expect(result.stages[1]!.blockedBy).toBe("suspend");
      expect(result.stages[1]!.delta).toEqual({ status: "pending" });
      expect(result.stages[1]!.commands).toHaveLength(1);
      expect(result.stages[1]!.commands![0]!.type).toBe("suspend");
      expect(result.suspendedAt).toBe("suspendingStep");
      expect(result.error).toBeUndefined();
    });

    it("stops on review command", async () => {
      const pipeline = definePipeline({
        name: "review-test",
        version: "1.0.0",
        stages: [
          { step: parseDocument },
          { step: reviewingStep, wire: () => ({ data: "risky" }) },
          { step: verifyClaims, wire: () => ({ claims: [] }) },
        ],
      });

      const result = await runPipeline({
        pipeline,
        input: { documentId: "doc-review" },
        contextFactory,
        workflowId: "test",
        runId: "run-review",
      });

      expect(result.ok).toBe(false);
      expect(result.stages).toHaveLength(2);
      expect(result.stages[1]!.status).toBe("suspended");
      expect(result.stages[1]!.blockedBy).toBe("review");
      expect(result.stages[1]!.commands![0]!.type).toBe("review");
      expect(result.suspendedAt).toBe("reviewingStep");
    });

    it("throws on multiple blocking commands", async () => {
      const multiBlockingStep = defineStep({
        name: "multiBlockingStep",
        input: z.object({ data: z.string() }),
        delta: z.object({ status: z.string() }),
        run: async () => ({
          delta: { status: "blocked" },
          events: [],
          commands: [
            suspend({ reason: "first", checkpoint: {} }),
            review("second", {}),
          ],
        }),
      });

      const pipeline = definePipeline({
        name: "multi-blocking-test",
        version: "1.0.0",
        stages: [{ step: multiBlockingStep }],
      });

      await expect(
        runPipeline({
          pipeline,
          input: { data: "test" },
          contextFactory,
          workflowId: "test",
          runId: "run-multi-block",
        }),
      ).rejects.toThrow(
        'Multiple blocking commands in pipeline stage "multiBlockingStep"',
      );
    });

    it("suspend discards sibling commands", async () => {
      const suspendWithEmitStep = defineStep({
        name: "suspendWithEmitStep",
        input: z.object({ data: z.string() }),
        delta: z.object({ status: z.string() }),
        run: async () => ({
          delta: { status: "pending" },
          events: [],
          commands: [
            emit("notifications", { message: "hello" }),
            suspend({ reason: "awaiting", checkpoint: {} }),
          ],
        }),
      });

      const pipeline = definePipeline({
        name: "suspend-discard-test",
        version: "1.0.0",
        stages: [{ step: suspendWithEmitStep }],
      });

      const result = await runPipeline({
        pipeline,
        input: { data: "test" },
        contextFactory,
        workflowId: "test",
        runId: "run-suspend-discard",
      });

      expect(result.ok).toBe(false);
      expect(result.suspendedAt).toBe("suspendWithEmitStep");
      // Only suspend command should be present (emit discarded)
      expect(result.stages[0]!.commands).toHaveLength(1);
      expect(result.stages[0]!.commands![0]!.type).toBe("suspend");
    });

    it("review keeps sibling commands (deferred)", async () => {
      const reviewWithEmitStep = defineStep({
        name: "reviewWithEmitStep",
        input: z.object({ data: z.string() }),
        delta: z.object({ status: z.string() }),
        run: async () => ({
          delta: { status: "pending_review" },
          events: [],
          commands: [
            emit("notifications", { message: "hello" }),
            review("high_risk", {}),
          ],
        }),
      });

      const pipeline = definePipeline({
        name: "review-keep-test",
        version: "1.0.0",
        stages: [{ step: reviewWithEmitStep }],
      });

      const result = await runPipeline({
        pipeline,
        input: { data: "test" },
        contextFactory,
        workflowId: "test",
        runId: "run-review-keep",
      });

      expect(result.ok).toBe(false);
      expect(result.suspendedAt).toBe("reviewWithEmitStep");
      // Both commands should be present (emit deferred)
      expect(result.stages[0]!.commands).toHaveLength(2);
      expect(result.stages[0]!.commands!.map((c) => c.type)).toEqual([
        "emit",
        "review",
      ]);
    });
  });

  describe("control commands", () => {
    it("throws on invoke command", async () => {
      const pipeline = definePipeline({
        name: "invoke-test",
        version: "1.0.0",
        stages: [{ step: invokingStep }],
      });

      await expect(
        runPipeline({
          pipeline,
          input: { data: "test" },
          contextFactory,
          workflowId: "test",
          runId: "run-invoke",
        }),
      ).rejects.toThrow(
        'Control command "invoke" not allowed in pipeline stage "invokingStep"',
      );
    });

    it("throws on fanout command", async () => {
      const pipeline = definePipeline({
        name: "fanout-test",
        version: "1.0.0",
        stages: [{ step: fanoutStep }],
      });

      await expect(
        runPipeline({
          pipeline,
          input: { data: "test" },
          contextFactory,
          workflowId: "test",
          runId: "run-fanout",
        }),
      ).rejects.toThrow(
        'Control command "fanout" not allowed in pipeline stage "fanoutStep"',
      );
    });

    it("throws on control command even with other commands present", async () => {
      const mixedStep = defineStep({
        name: "mixedStep",
        input: z.object({ data: z.string() }),
        delta: z.object({ result: z.string() }),
        run: async () => ({
          delta: { result: "done" },
          events: [],
          commands: [
            emit("notifications", { message: "hello" }),
            invoke("otherStep", { foo: "bar" }),
          ],
        }),
      });

      const pipeline = definePipeline({
        name: "mixed-control-test",
        version: "1.0.0",
        stages: [{ step: mixedStep }],
      });

      await expect(
        runPipeline({
          pipeline,
          input: { data: "test" },
          contextFactory,
          workflowId: "test",
          runId: "run-mixed",
        }),
      ).rejects.toThrow(
        'Control command "invoke" not allowed in pipeline stage "mixedStep"',
      );
    });
  });

  describe("side-effect commands", () => {
    it("allows emit commands to pass through", async () => {
      const pipeline = definePipeline({
        name: "emit-test",
        version: "1.0.0",
        stages: [
          { step: emittingStep },
          { step: parseDocument, wire: () => ({ documentId: "after-emit" }) },
        ],
      });

      const result = await runPipeline({
        pipeline,
        input: { data: "hello" },
        contextFactory,
        workflowId: "test",
        runId: "run-emit",
      });

      expect(result.ok).toBe(true);
      expect(result.stages[0]!.status).toBe("completed");
      expect(result.stages[0]!.commands).toHaveLength(1);
      expect(result.stages[0]!.commands![0]!.type).toBe("emit");
      expect(result.stages[1]!.status).toBe("completed");
    });

    it("does not include commands in stage result when empty", async () => {
      const pipeline = definePipeline({
        name: "no-commands",
        version: "1.0.0",
        stages: [{ step: parseDocument }],
      });

      const result = await runPipeline({
        pipeline,
        input: { documentId: "doc-no-cmd" },
        contextFactory,
        workflowId: "test",
        runId: "run-no-cmd",
      });

      expect(result.ok).toBe(true);
      expect(result.stages[0]!.commands).toBeUndefined();
    });
  });

  describe("empty pipeline", () => {
    it("returns ok with undefined output", async () => {
      const pipeline = definePipeline({
        name: "empty",
        version: "1.0.0",
        stages: [],
      });

      const result = await runPipeline({
        pipeline,
        input: { anything: "ignored" },
        contextFactory,
        workflowId: "test",
        runId: "run-empty",
      });

      expect(result.ok).toBe(true);
      expect(result.stages).toEqual([]);
      expect(result.output).toBeUndefined();
    });
  });

  describe("runId", () => {
    it("uses provided runId", async () => {
      const pipeline = definePipeline({
        name: "runid-test",
        version: "1.0.0",
        stages: [{ step: parseDocument }],
      });

      const result = await runPipeline({
        pipeline,
        input: { documentId: "doc" },
        contextFactory,
        workflowId: "test",
        runId: "my-custom-run-id",
      });

      expect(result.runId).toBe("my-custom-run-id");
    });

    it("generates runId when not provided", async () => {
      const pipeline = definePipeline({
        name: "runid-gen",
        version: "1.0.0",
        stages: [{ step: parseDocument }],
      });

      const result = await runPipeline({
        pipeline,
        input: { documentId: "doc" },
        contextFactory,
        workflowId: "test",
      });

      expect(result.runId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it("all stages share the same runId", async () => {
      let capturedRunIds: string[] = [];

      const trackingStep = defineStep({
        name: "trackingStep",
        input: z.object({ x: z.number() }),
        delta: z.object({ y: z.number() }),
        run: async (input, ctx) => {
          capturedRunIds.push(ctx.runId);
          return { delta: { y: input.x }, events: [] };
        },
      });

      const pipeline = definePipeline({
        name: "shared-runid",
        version: "1.0.0",
        stages: [
          { step: trackingStep },
          { step: trackingStep, wire: (prev: any) => ({ x: prev.y + 1 }) },
          { step: trackingStep, wire: (prev: any) => ({ x: prev.y + 1 }) },
        ],
      });

      capturedRunIds = [];
      const result = await runPipeline({
        pipeline,
        input: { x: 1 },
        contextFactory,
        workflowId: "test",
        runId: "shared-run",
      });

      expect(result.ok).toBe(true);
      expect(capturedRunIds).toEqual([
        "shared-run",
        "shared-run",
        "shared-run",
      ]);
    });
  });

  describe("stage status values", () => {
    it("completed for successful stages", async () => {
      const pipeline = definePipeline({
        name: "status-completed",
        version: "1.0.0",
        stages: [{ step: parseDocument }],
      });

      const result = await runPipeline({
        pipeline,
        input: { documentId: "doc" },
        contextFactory,
        workflowId: "test",
        runId: "run-status-1",
      });

      expect(result.stages[0]!.status).toBe("completed");
    });

    it("failed for error stages", async () => {
      const pipeline = definePipeline({
        name: "status-failed",
        version: "1.0.0",
        stages: [{ step: failingStep }],
      });

      const result = await runPipeline({
        pipeline,
        input: { shouldFail: true },
        contextFactory,
        workflowId: "test",
        runId: "run-status-2",
      });

      expect(result.stages[0]!.status).toBe("failed");
    });

    it("continued for error stages with continue policy", async () => {
      const pipeline = definePipeline({
        name: "status-continued",
        version: "1.0.0",
        stages: [{ step: failingStep, onError: "continue" }],
      });

      const result = await runPipeline({
        pipeline,
        input: { shouldFail: true },
        contextFactory,
        workflowId: "test",
        runId: "run-status-3",
      });

      expect(result.stages[0]!.status).toBe("continued");
    });

    it("suspended for blocking command stages", async () => {
      const pipeline = definePipeline({
        name: "status-suspended",
        version: "1.0.0",
        stages: [{ step: suspendingStep }],
      });

      const result = await runPipeline({
        pipeline,
        input: { data: "test" },
        contextFactory,
        workflowId: "test",
        runId: "run-status-4",
      });

      expect(result.stages[0]!.status).toBe("suspended");
    });
  });
});
