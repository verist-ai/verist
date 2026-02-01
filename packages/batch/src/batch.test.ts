// SPDX-License-Identifier: Apache-2.0

import {
  createContextFactory,
  defineStep,
  review,
  suspend,
} from "@verist/core";
import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { runBatch } from "./batch.ts";

const processItem = defineStep({
  name: "processItem",
  input: z.object({ id: z.string(), value: z.number() }),
  delta: z.object({ processed: z.boolean(), doubled: z.number() }),
  run: async (input) => ({
    delta: { processed: true, doubled: input.value * 2 },
    events: [{ type: "item_processed", payload: { id: input.id } }],
  }),
});

const failingStep = defineStep({
  name: "failingStep",
  input: z.object({ id: z.string(), shouldFail: z.boolean() }),
  delta: z.object({ result: z.string() }),
  run: async (input) => {
    if (input.shouldFail) {
      throw new Error(`Item ${input.id} failed`);
    }
    return { delta: { result: "ok" }, events: [] };
  },
});

const barrierStep = defineStep({
  name: "barrierStep",
  input: z.object({
    id: z.string(),
    barrier: z.enum(["none", "suspend", "review"]),
  }),
  delta: z.object({ status: z.string() }),
  run: async (input) => {
    if (input.barrier === "suspend") {
      return {
        delta: { status: "pending" },
        events: [],
        commands: [
          suspend({ reason: "awaiting_input", checkpoint: { id: input.id } }),
        ],
      };
    }
    if (input.barrier === "review") {
      return {
        delta: { status: "pending_review" },
        events: [],
        commands: [review("high_risk", { id: input.id })],
      };
    }
    return { delta: { status: "completed" }, events: [] };
  },
});

const contextFactory = createContextFactory({});

describe("runBatch", () => {
  it("processes all items successfully", async () => {
    const items = [
      { id: "a", value: 1 },
      { id: "b", value: 2 },
      { id: "c", value: 3 },
    ];

    const result = await runBatch({
      step: processItem,
      items,
      contextFactory,
      workflowId: "test-batch",
      workflowVersion: "1.0.0",
      batchId: "batch-1",
    });

    expect(result.batchId).toBe("batch-1");
    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.blocked).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.aborted).toBe(false);

    expect(result.results[0]!.status).toBe("succeeded");
    expect(result.results[0]!.delta).toEqual({ processed: true, doubled: 2 });
    expect(result.results[1]!.delta).toEqual({ processed: true, doubled: 4 });
    expect(result.results[2]!.delta).toEqual({ processed: true, doubled: 6 });
  });

  it("preserves typed input in results", async () => {
    const items = [{ id: "test-item", value: 42 }];

    const result = await runBatch({
      step: processItem,
      items,
      contextFactory,
      workflowId: "test",
      workflowVersion: "1.0.0",
      batchId: "batch-typed",
    });

    // Type-safe access to input
    expect(result.results[0]!.input.id).toBe("test-item");
    expect(result.results[0]!.input.value).toBe(42);
  });

  it("uses itemKey for runId", async () => {
    const items = [
      { id: "doc-123", value: 1 },
      { id: "doc-456", value: 2 },
    ];

    const result = await runBatch({
      step: processItem,
      items,
      contextFactory,
      workflowId: "test",
      workflowVersion: "1.0.0",
      batchId: "batch-2",
      options: {
        itemKey: (item) => item.id,
      },
    });

    expect(result.results[0]!.runId).toBe("batch-2::doc-123");
    expect(result.results[0]!.itemKey).toBe("doc-123");
    expect(result.results[1]!.runId).toBe("batch-2::doc-456");
    expect(result.results[1]!.itemKey).toBe("doc-456");
  });

  it("falls back to index when itemKey returns undefined", async () => {
    const items = [{ id: "a", value: 1 }];

    const result = await runBatch({
      step: processItem,
      items,
      contextFactory,
      workflowId: "test",
      workflowVersion: "1.0.0",
      batchId: "batch-3",
      options: {
        itemKey: () => undefined,
      },
    });

    expect(result.results[0]!.runId).toBe("batch-3::0");
    expect(result.results[0]!.itemKey).toBeUndefined();
  });

  describe("itemKey validation", () => {
    it("throws on duplicate itemKey", async () => {
      const items = [
        { id: "same", value: 1 },
        { id: "different", value: 2 },
        { id: "same", value: 3 },
      ];

      await expect(
        runBatch({
          step: processItem,
          items,
          contextFactory,
          workflowId: "test",
          workflowVersion: "1.0.0",
          batchId: "batch-dup",
          options: {
            itemKey: (item) => item.id,
          },
        }),
      ).rejects.toThrow('Duplicate itemKey "same" at indices 0 and 2');
    });

    it("throws if itemKey contains reserved delimiter", async () => {
      const items = [{ id: "key::with::colons", value: 1 }];

      await expect(
        runBatch({
          step: processItem,
          items,
          contextFactory,
          workflowId: "test",
          workflowVersion: "1.0.0",
          batchId: "batch-delim",
          options: {
            itemKey: (item) => item.id,
          },
        }),
      ).rejects.toThrow(
        'itemKey "key::with::colons" at index 0 contains reserved delimiter "::"',
      );
    });
  });

  describe("failure handling", () => {
    it("continues on failure with continue policy", async () => {
      const items = [
        { id: "a", shouldFail: false },
        { id: "b", shouldFail: true },
        { id: "c", shouldFail: false },
      ];

      const result = await runBatch({
        step: failingStep,
        items,
        contextFactory,
        workflowId: "test",
        workflowVersion: "1.0.0",
        batchId: "batch-continue",
        options: {
          failurePolicy: "continue",
          concurrency: 1, // Sequential to ensure order
        },
      });

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.aborted).toBe(false);

      expect(result.results[0]!.status).toBe("succeeded");
      expect(result.results[1]!.status).toBe("failed");
      expect(result.results[1]!.error?.code).toBe("EXECUTION");
      expect(result.results[2]!.status).toBe("succeeded");
    });

    it("aborts on failure with abort policy", async () => {
      const items = [
        { id: "a", shouldFail: false },
        { id: "b", shouldFail: true },
        { id: "c", shouldFail: false },
        { id: "d", shouldFail: false },
        { id: "e", shouldFail: false },
      ];

      const result = await runBatch({
        step: failingStep,
        items,
        contextFactory,
        workflowId: "test",
        workflowVersion: "1.0.0",
        batchId: "batch-abort",
        options: {
          failurePolicy: "abort",
          concurrency: 1, // Sequential to ensure predictable abort
        },
      });

      expect(result.aborted).toBe(true);
      expect(result.failed).toBe(1);
      expect(result.skipped).toBeGreaterThan(0);
      expect(result.succeeded + result.failed + result.skipped).toBe(5);
    });
  });

  describe("barrier handling", () => {
    it("marks suspend commands as blocked", async () => {
      const items = [
        { id: "a", barrier: "none" as const },
        { id: "b", barrier: "suspend" as const },
        { id: "c", barrier: "none" as const },
      ];

      const result = await runBatch({
        step: barrierStep,
        items,
        contextFactory,
        workflowId: "test",
        workflowVersion: "1.0.0",
        batchId: "batch-suspend",
      });

      expect(result.succeeded).toBe(2);
      expect(result.blocked).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.aborted).toBe(false);

      expect(result.results[1]!.status).toBe("blocked");
      expect(result.results[1]!.blockedBy).toBe("suspend");
      expect(result.results[1]!.delta).toEqual({ status: "pending" });
      // runId can be used to query for suspension records
      expect(result.results[1]!.runId).toBe("batch-suspend::1");
    });

    it("marks review commands as blocked", async () => {
      const items = [
        { id: "a", barrier: "none" as const },
        { id: "b", barrier: "review" as const },
        { id: "c", barrier: "none" as const },
      ];

      const result = await runBatch({
        step: barrierStep,
        items,
        contextFactory,
        workflowId: "test",
        workflowVersion: "1.0.0",
        batchId: "batch-review",
      });

      expect(result.succeeded).toBe(2);
      expect(result.blocked).toBe(1);
      expect(result.failed).toBe(0);

      expect(result.results[1]!.status).toBe("blocked");
      expect(result.results[1]!.blockedBy).toBe("review");
      expect(result.results[1]!.delta).toEqual({ status: "pending_review" });
      expect(result.results[1]!.commands?.[0]!.type).toBe("review");
    });

    it("does not abort on blocked items", async () => {
      const items = [
        { id: "a", barrier: "none" as const },
        { id: "b", barrier: "suspend" as const },
        { id: "c", barrier: "review" as const },
        { id: "d", barrier: "none" as const },
      ];

      const result = await runBatch({
        step: barrierStep,
        items,
        contextFactory,
        workflowId: "test",
        workflowVersion: "1.0.0",
        batchId: "batch-no-abort-barrier",
        options: {
          failurePolicy: "abort",
        },
      });

      // Barriers should not trigger abort
      expect(result.aborted).toBe(false);
      expect(result.succeeded).toBe(2);
      expect(result.blocked).toBe(2);
      expect(result.skipped).toBe(0);
    });
  });

  describe("concurrency", () => {
    it("respects concurrency limit", async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const trackingStep = defineStep({
        name: "trackingStep",
        input: z.object({ id: z.number() }),
        delta: z.object({ done: z.boolean() }),
        run: async () => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await new Promise((r) => setTimeout(r, 10));
          currentConcurrent--;
          return { delta: { done: true }, events: [] };
        },
      });

      const items = Array.from({ length: 20 }, (_, i) => ({ id: i }));

      await runBatch({
        step: trackingStep,
        items,
        contextFactory,
        workflowId: "test",
        workflowVersion: "1.0.0",
        batchId: "batch-concurrency",
        options: {
          concurrency: 5,
        },
      });

      expect(maxConcurrent).toBeLessThanOrEqual(5);
    });

    it("uses default concurrency of 10", async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const trackingStep = defineStep({
        name: "trackingStep",
        input: z.object({ id: z.number() }),
        delta: z.object({ done: z.boolean() }),
        run: async () => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await new Promise((r) => setTimeout(r, 5));
          currentConcurrent--;
          return { delta: { done: true }, events: [] };
        },
      });

      const items = Array.from({ length: 30 }, (_, i) => ({ id: i }));

      await runBatch({
        step: trackingStep,
        items,
        contextFactory,
        workflowId: "test",
        workflowVersion: "1.0.0",
        batchId: "batch-default-concurrency",
      });

      expect(maxConcurrent).toBeLessThanOrEqual(10);
    });
  });

  describe("result ordering", () => {
    it("returns results in input order", async () => {
      const delayStep = defineStep({
        name: "delayStep",
        input: z.object({ id: z.number(), delay: z.number() }),
        delta: z.object({ id: z.number() }),
        run: async (input) => {
          await new Promise((r) => setTimeout(r, input.delay));
          return { delta: { id: input.id }, events: [] };
        },
      });

      // Items with varying delays – later items may complete first
      const items = [
        { id: 0, delay: 30 },
        { id: 1, delay: 10 },
        { id: 2, delay: 20 },
      ];

      const result = await runBatch({
        step: delayStep,
        items,
        contextFactory,
        workflowId: "test",
        workflowVersion: "1.0.0",
        batchId: "batch-order",
        options: {
          concurrency: 3,
        },
      });

      // Results should be in input order regardless of completion order
      expect(result.results[0]!.index).toBe(0);
      expect(result.results[0]!.delta).toEqual({ id: 0 });
      expect(result.results[1]!.index).toBe(1);
      expect(result.results[1]!.delta).toEqual({ id: 1 });
      expect(result.results[2]!.index).toBe(2);
      expect(result.results[2]!.delta).toEqual({ id: 2 });
    });
  });

  describe("invariants", () => {
    it("maintains count invariant: succeeded + failed + blocked + skipped === total", async () => {
      const mixedStep = defineStep({
        name: "mixedStep",
        input: z.object({
          action: z.enum(["succeed", "fail", "suspend", "review"]),
        }),
        delta: z.object({ status: z.string() }),
        run: async (input) => {
          if (input.action === "fail") {
            throw new Error("failure");
          }
          if (input.action === "suspend") {
            return {
              delta: { status: "suspended" },
              events: [],
              commands: [suspend({ reason: "test", checkpoint: {} })],
            };
          }
          if (input.action === "review") {
            return {
              delta: { status: "review" },
              events: [],
              commands: [review("test")],
            };
          }
          return { delta: { status: "ok" }, events: [] };
        },
      });

      const items = [
        { action: "succeed" as const },
        { action: "fail" as const },
        { action: "suspend" as const },
        { action: "review" as const },
        { action: "succeed" as const },
      ];

      const result = await runBatch({
        step: mixedStep,
        items,
        contextFactory,
        workflowId: "test",
        workflowVersion: "1.0.0",
        batchId: "batch-invariant",
        options: {
          failurePolicy: "continue",
        },
      });

      expect(
        result.succeeded + result.failed + result.blocked + result.skipped,
      ).toBe(result.total);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.blocked).toBe(2); // suspend + review
    });
  });

  describe("input validation", () => {
    it("records validation errors as failed items", async () => {
      const items = [
        { id: "valid", value: 1 },
        { id: 123 as unknown as string, value: 2 }, // Invalid type
      ];

      const result = await runBatch({
        step: processItem,
        items: items as Array<{ id: string; value: number }>,
        contextFactory,
        workflowId: "test",
        workflowVersion: "1.0.0",
        batchId: "batch-validation",
      });

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[1]!.error?.code).toBe("INPUT_VALIDATION");
    });
  });

  it("handles empty batch", async () => {
    const result = await runBatch({
      step: processItem,
      items: [],
      contextFactory,
      workflowId: "test",
      workflowVersion: "1.0.0",
      batchId: "batch-empty",
    });

    expect(result.total).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.results).toEqual([]);
  });

  it("includes events in results", async () => {
    const items = [{ id: "a", value: 10 }];

    const result = await runBatch({
      step: processItem,
      items,
      contextFactory,
      workflowId: "test",
      workflowVersion: "1.0.0",
      batchId: "batch-events",
    });

    expect(result.results[0]!.events).toEqual([
      { type: "item_processed", payload: { id: "a" } },
    ]);
  });

  it("does not set blockedBy on non-blocked results", async () => {
    const items = [
      { id: "a", barrier: "none" as const },
      { id: "b", barrier: "suspend" as const },
    ];

    const result = await runBatch({
      step: barrierStep,
      items,
      contextFactory,
      workflowId: "test",
      workflowVersion: "1.0.0",
      batchId: "batch-no-blockedby",
    });

    expect(result.results[0]!.status).toBe("succeeded");
    expect(result.results[0]!.blockedBy).toBeUndefined();
    expect(result.results[1]!.status).toBe("blocked");
    expect(result.results[1]!.blockedBy).toBe("suspend");
  });

  it("tracks duration per item", async () => {
    const slowStep = defineStep({
      name: "slowStep",
      input: z.object({ id: z.number() }),
      delta: z.object({ done: z.boolean() }),
      run: async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { delta: { done: true }, events: [] };
      },
    });

    const result = await runBatch({
      step: slowStep,
      items: [{ id: 1 }],
      contextFactory,
      workflowId: "test",
      workflowVersion: "1.0.0",
      batchId: "batch-duration",
    });

    expect(result.results[0]!.durationMs).toBeGreaterThanOrEqual(50);
  });
});
