// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { defineStep } from "./step.ts";
import { defineWorkflow } from "./workflow.ts";

describe("defineWorkflow", () => {
  it("creates a workflow with steps", () => {
    const step1 = defineStep({
      name: "step1",
      input: z.object({ a: z.string() }),
      delta: z.object({ b: z.string() }),
      run: async (input) => ({ delta: { b: input.a }, events: [] }),
    });

    const step2 = defineStep({
      name: "step2",
      input: z.object({ b: z.string() }),
      delta: z.object({ c: z.string() }),
      run: async (input) => ({ delta: { c: input.b }, events: [] }),
    });

    const workflow = defineWorkflow({
      name: "test-workflow",
      version: "1.0.0",
      steps: { step1, step2 },
    });

    expect(workflow.name).toBe("test-workflow");
    expect(workflow.version).toBe("1.0.0");
    expect(workflow.getStep("step1")).toBe(step1);
    expect(workflow.getStep("step2")).toBe(step2);
  });

  it("throws on unknown step", () => {
    const workflow = defineWorkflow({
      name: "test",
      version: "1.0.0",
      steps: {},
    });

    // @ts-expect-error - testing runtime behavior for unknown key
    expect(() => workflow.getStep("unknown")).toThrow(
      /Step "unknown" not found/,
    );
  });

  describe("typed commands", () => {
    it("creates typed invoke command", () => {
      const extract = defineStep({
        name: "extract",
        input: z.object({ documentId: z.string() }),
        delta: z.object({ claims: z.array(z.string()) }),
        run: async () => ({ delta: { claims: [] }, events: [] }),
      });

      const verify = defineStep({
        name: "verify",
        input: z.object({ claims: z.array(z.string()) }),
        delta: z.object({ verified: z.boolean() }),
        run: async () => ({ delta: { verified: true }, events: [] }),
      });

      const workflow = defineWorkflow({
        name: "doc-workflow",
        version: "1.0.0",
        steps: { extract, verify },
      });

      const cmd = workflow.invoke("verify", { claims: ["claim1"] });

      expect(cmd).toEqual({
        type: "invoke",
        step: "verify",
        input: { claims: ["claim1"] },
      });
    });

    it("creates typed fanout command", () => {
      const processItem = defineStep({
        name: "processItem",
        input: z.object({ itemId: z.string() }),
        delta: z.object({ processed: z.boolean() }),
        run: async () => ({ delta: { processed: true }, events: [] }),
      });

      const workflow = defineWorkflow({
        name: "batch-workflow",
        version: "1.0.0",
        steps: { processItem },
      });

      const cmd = workflow.fanout("processItem", [
        { itemId: "item-1" },
        { itemId: "item-2" },
      ]);

      expect(cmd).toEqual({
        type: "fanout",
        step: "processItem",
        inputs: [{ itemId: "item-1" }, { itemId: "item-2" }],
      });
    });

    it("throws on unknown step for invoke", () => {
      const workflow = defineWorkflow({
        name: "test",
        version: "1.0.0",
        steps: {},
      });

      // @ts-expect-error - testing runtime behavior for unknown step
      expect(() => workflow.invoke("unknown", {})).toThrow(
        /Step "unknown" not found/,
      );
    });

    it("throws on unknown step for fanout", () => {
      const workflow = defineWorkflow({
        name: "test",
        version: "1.0.0",
        steps: {},
      });

      // @ts-expect-error - testing runtime behavior for unknown step
      expect(() => workflow.fanout("unknown", [])).toThrow(
        /Step "unknown" not found/,
      );
    });

    it("creates review command", () => {
      const workflow = defineWorkflow({
        name: "doc-workflow",
        version: "1.0.0",
        steps: {},
      });

      const cmd = workflow.review({
        reason: "high_risk_transaction",
        payload: { amount: 50000, currency: "USD" },
      });

      expect(cmd).toEqual({
        type: "review",
        reason: "high_risk_transaction",
        payload: { amount: 50000, currency: "USD" },
      });
    });

    it("creates review command without payload", () => {
      const workflow = defineWorkflow({
        name: "test",
        version: "1.0.0",
        steps: {},
      });

      const cmd = workflow.review({ reason: "approval_required" });

      expect(cmd).toEqual({
        type: "review",
        reason: "approval_required",
        payload: undefined,
      });
    });

    it("creates typed suspend command", () => {
      const handleDoc = defineStep({
        name: "handleDoc",
        input: z.object({ docId: z.string() }),
        delta: z.object({ processed: z.boolean() }),
        run: async () => ({ delta: { processed: true }, events: [] }),
      });

      const workflow = defineWorkflow({
        name: "doc-workflow",
        version: "1.0.0",
        steps: { handleDoc },
      });

      const cmd = workflow.suspend({
        reason: "awaiting_upload",
        checkpoint: { claimId: "c-1" },
        resumeStep: "handleDoc",
      });

      expect(cmd).toEqual({
        type: "suspend",
        reason: "awaiting_upload",
        checkpoint: { claimId: "c-1" },
        resumeStep: "handleDoc",
      });
    });

    it("creates suspend command without resumeStep", () => {
      const workflow = defineWorkflow({
        name: "test",
        version: "1.0.0",
        steps: {},
      });

      const cmd = workflow.suspend({
        reason: "awaiting_callback",
        checkpoint: { webhookId: "wh-1" },
      });

      expect(cmd).toEqual({
        type: "suspend",
        reason: "awaiting_callback",
        checkpoint: { webhookId: "wh-1" },
      });
    });

    it("throws on unknown step for suspend", () => {
      const step1 = defineStep({
        name: "step1",
        input: z.object({}),
        delta: z.object({}),
        run: async () => ({ delta: {}, events: [] }),
      });

      const workflow = defineWorkflow({
        name: "test",
        version: "1.0.0",
        steps: { step1 },
      });

      expect(() =>
        workflow.suspend({
          reason: "test",
          checkpoint: {},
          // @ts-expect-error - testing runtime behavior for unknown step
          resumeStep: "unknown",
        }),
      ).toThrow(/Step "unknown" not found/);
    });
  });
});
