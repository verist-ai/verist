// SPDX-License-Identifier: Apache-2.0

import { describe, expect, expectTypeOf, it } from "bun:test";
import { z } from "zod";
import { defineStep, type StepDelta, type StepInput } from "./step.ts";

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

  it("StepDelta and StepInput extract correct types", () => {
    const step = defineStep({
      name: "test",
      input: z.object({ id: z.string() }),
      delta: z.object({ score: z.number() }),
      run: async () => ({ delta: { score: 1 }, events: [] }),
    });
    expectTypeOf<StepInput<typeof step>>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<StepDelta<typeof step>>().toEqualTypeOf<{ score: number }>();
  });
});
