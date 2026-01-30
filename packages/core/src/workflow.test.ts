import { describe, it, expect } from "bun:test";
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
      'Step "unknown" not found',
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
        'Step "unknown" not found',
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
        'Step "unknown" not found',
      );
    });
  });
});
