import { describe, it, expect } from "bun:test";
import { createContextFactory } from "./context.ts";

describe("createContextFactory", () => {
  it("creates context with adapters and metadata", () => {
    const adapters = { db: { query: () => [] } };
    const factory = createContextFactory(adapters);

    const ctx = factory({
      workflowId: "wf-1",
      workflowVersion: "1.0.0",
      runId: "run-1",
    });

    expect(ctx.adapters).toBe(adapters);
    expect(ctx.workflowId).toBe("wf-1");
    expect(ctx.workflowVersion).toBe("1.0.0");
    expect(ctx.runId).toBe("run-1");
  });
});
