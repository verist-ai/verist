import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  CommandSchema,
  emit,
  fanout,
  invoke,
  review,
  suspend,
} from "./command.ts";
import { createContextFactory } from "./context.ts";
import { runStep } from "./run.ts";
import { defineStep } from "./step.ts";

describe("Commands", () => {
  it("invoke helper creates correct command", () => {
    const cmd = invoke("nextStep", { id: 123 });
    expect(cmd).toEqual({
      type: "invoke",
      step: "nextStep",
      input: { id: 123 },
    });
    expect(CommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("fanout helper creates correct command", () => {
    const cmd = fanout("processItem", [{ id: 1 }, { id: 2 }]);
    expect(cmd).toEqual({
      type: "fanout",
      step: "processItem",
      inputs: [{ id: 1 }, { id: 2 }],
    });
    expect(CommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("review helper creates correct command", () => {
    const cmd = review("needs human verification", { claimId: "c-1" });
    expect(cmd).toEqual({
      type: "review",
      reason: "needs human verification",
      payload: { claimId: "c-1" },
    });
    expect(CommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("emit helper creates correct command", () => {
    const cmd = emit("document.verified", { docId: "d-1", score: 0.95 });
    expect(cmd).toEqual({
      type: "emit",
      topic: "document.verified",
      payload: { docId: "d-1", score: 0.95 },
    });
    expect(CommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("suspend helper creates correct command", () => {
    const cmd = suspend({
      reason: "awaiting_documentation",
      checkpoint: { claimId: "c-1", requestedDocType: "financial" },
      resumeStep: "handleDocumentation",
    });
    expect(cmd).toEqual({
      type: "suspend",
      reason: "awaiting_documentation",
      checkpoint: { claimId: "c-1", requestedDocType: "financial" },
      resumeStep: "handleDocumentation",
    });
    expect(CommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("suspend helper works without resumeStep", () => {
    const cmd = suspend({
      reason: "awaiting_callback",
      checkpoint: { webhookId: "wh-1" },
    });
    expect(cmd).toEqual({
      type: "suspend",
      reason: "awaiting_callback",
      checkpoint: { webhookId: "wh-1" },
    });
    expect(CommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("step can return commands", async () => {
    const routingStep = defineStep({
      name: "route",
      input: z.object({ type: z.string() }),
      delta: z.object({ routed: z.boolean() }),
      run: async (input) => ({
        delta: { routed: true },
        events: [{ type: "routed", payload: { to: input.type } }],
        commands: [
          input.type === "urgent"
            ? invoke("urgentHandler", { priority: 1 })
            : invoke("normalHandler", { priority: 5 }),
        ],
      }),
    });

    const result = await runStep({
      step: routingStep,
      input: { type: "urgent" },
      contextFactory: createContextFactory({}),
      workflowId: "test",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output.commands).toEqual([
        { type: "invoke", step: "urgentHandler", input: { priority: 1 } },
      ]);
    }
  });

  it("step can return fanout commands for parallel processing", async () => {
    const fanoutStep = defineStep({
      name: "distribute",
      input: z.object({ items: z.array(z.string()) }),
      delta: z.object({ distributed: z.boolean() }),
      run: async (input) => ({
        delta: { distributed: true },
        events: [
          { type: "distributed", payload: { count: input.items.length } },
        ],
        commands: [
          fanout(
            "processItem",
            input.items.map((id) => ({ id })),
          ),
        ],
      }),
    });

    const result = await runStep({
      step: fanoutStep,
      input: { items: ["a", "b", "c"] },
      contextFactory: createContextFactory({}),
      workflowId: "test",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output.commands).toEqual([
        {
          type: "fanout",
          step: "processItem",
          inputs: [{ id: "a" }, { id: "b" }, { id: "c" }],
        },
      ]);
    }
  });

  it("step can return review command for human-in-the-loop", async () => {
    const verifyStep = defineStep({
      name: "verify",
      input: z.object({ confidence: z.number() }),
      delta: z.object({ verified: z.boolean().optional() }),
      run: async (input) => {
        if (input.confidence < 0.8) {
          return {
            delta: {},
            events: [{ type: "low_confidence" }],
            commands: [
              review("confidence below threshold", { score: input.confidence }),
            ],
          };
        }
        return {
          delta: { verified: true },
          events: [{ type: "auto_verified" }],
        };
      },
    });

    const lowConfResult = await runStep({
      step: verifyStep,
      input: { confidence: 0.5 },
      contextFactory: createContextFactory({}),
      workflowId: "test",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });

    expect(lowConfResult.ok).toBe(true);
    if (lowConfResult.ok) {
      expect(lowConfResult.value.output.commands).toEqual([
        {
          type: "review",
          reason: "confidence below threshold",
          payload: { score: 0.5 },
        },
      ]);
    }

    const highConfResult = await runStep({
      step: verifyStep,
      input: { confidence: 0.9 },
      contextFactory: createContextFactory({}),
      workflowId: "test",
      workflowVersion: "1.0.0",
      runId: "run-2",
    });

    expect(highConfResult.ok).toBe(true);
    if (highConfResult.ok) {
      expect(highConfResult.value.output.commands).toBeUndefined();
    }
  });
});
