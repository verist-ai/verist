import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { defineStep } from "./step.ts";

describe("defineStep", () => {
  it("creates a step with schemas", () => {
    const step = defineStep({
      name: "test-step",
      input: z.object({ value: z.number() }),
      delta: z.object({ result: z.number() }),
      run: async (input) => ({
        delta: { result: input.value * 2 },
        events: [],
      }),
    });

    expect(step.name).toBe("test-step");
    expect(step.inputSchema).toBeDefined();
    expect(step.deltaSchema).toBeDefined();
  });
});
