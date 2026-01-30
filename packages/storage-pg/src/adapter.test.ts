import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { isOk, isErr } from "@verist/core";
import type { RunStore } from "@verist/storage";
import { createPgRunStore } from "./adapter.ts";
import { veristState, veristEvents } from "./schema.ts";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/verist_test_db";

describe("createPgRunStore", () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;
  let store: RunStore;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    db = drizzle(pool);

    // Drop and recreate tables for clean schema
    await db.execute(sql`DROP TABLE IF EXISTS verist_events`);
    await db.execute(sql`DROP TABLE IF EXISTS verist_state`);

    await db.execute(sql`
      CREATE TABLE verist_state (
        workflow_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 0,
        computed JSONB NOT NULL DEFAULT '{}',
        overlay JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (workflow_id, run_id)
      )
    `);

    await db.execute(sql`
      CREATE TABLE verist_events (
        id BIGSERIAL PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload JSONB,
        llm_trace JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE INDEX verist_events_run_idx ON verist_events (workflow_id, run_id)
    `);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store = createPgRunStore({ db: db as any });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean tables before each test
    await db.delete(veristEvents);
    await db.delete(veristState);
  });

  describe("load", () => {
    test("returns null for non-existent state", async () => {
      const result = await store.load("wf-1", "run-1");

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBeNull();
      }
    });

    test("returns state after commit", async () => {
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { score: 0.8 },
        events: [],
      });

      const result = await store.load("wf-1", "run-1");

      expect(isOk(result)).toBe(true);
      if (isOk(result) && result.value) {
        expect(result.value.computed).toEqual({ score: 0.8 });
        expect(result.value.version).toBe(1);
      }
    });
  });

  describe("commit", () => {
    test("creates new run with expectedVersion 0", async () => {
      const result = await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { score: 0.8, status: "pending" },
        events: [{ type: "step_started", payload: { stepId: "step-1" } }],
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.workflowId).toBe("wf-1");
        expect(result.value.runId).toBe("run-1");
        expect(result.value.version).toBe(1);
        expect(result.value.computed).toEqual({
          score: 0.8,
          status: "pending",
        });
        expect(result.value.overlay).toEqual({});
      }

      // Verify events were written with stepId
      const events = await db
        .select()
        .from(veristEvents)
        .where(sql`workflow_id = 'wf-1' AND run_id = 'run-1'`);

      expect(events.length).toBe(1);
      expect(events[0]?.stepId).toBe("step-1");
      expect(events[0]?.type).toBe("step_started");
    });

    test("returns conflict when expectedVersion is 0 but run exists", async () => {
      // Create the run first
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { score: 0.8 },
        events: [],
      });

      // Try to create again with expectedVersion 0
      const result = await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-2",
        expectedVersion: 0,
        delta: { score: 0.9 },
        events: [],
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe("conflict");
        expect(result.error.message).toContain("Run already exists");
      }
    });

    test("returns not_found when expectedVersion > 0 but run doesn't exist", async () => {
      const result = await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 1, // Wrong: should be 0 for new run
        delta: { score: 0.8 },
        events: [],
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe("not_found");
      }
    });

    test("merges delta into existing computed state", async () => {
      // Create initial state
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { score: 0.8, status: "pending" },
        events: [],
      });

      // Commit second delta
      const result = await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-2",
        expectedVersion: 1,
        delta: { status: "complete", verified: true },
        events: [],
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.version).toBe(2);
        const computed = result.value.computed as Record<string, unknown>;
        expect(computed.score).toBe(0.8);
        expect(computed.status).toBe("complete");
        expect(computed.verified).toBe(true);
      }
    });

    test("returns conflict on version mismatch", async () => {
      // Create initial state
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { score: 0.8 },
        events: [],
      });

      // Try to commit with wrong version
      const result = await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-2",
        expectedVersion: 5, // Wrong: should be 1
        delta: { score: 0.9 },
        events: [],
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe("conflict");
        expect(result.error.message).toContain("Version mismatch");
      }
    });

    test("writes events atomically with state", async () => {
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "extract",
        expectedVersion: 0,
        delta: { claims: ["a", "b"] },
        events: [
          { type: "extraction_started" },
          {
            type: "llm_call",
            llmTrace: {
              model: "gpt-4",
              promptTokens: 100,
              completionTokens: 50,
              durationMs: 500,
              inputHash: "sha256:abc",
              outputHash: "sha256:def",
            },
          },
          { type: "extraction_completed", payload: { claimCount: 2 } },
        ],
      });

      const events = await db
        .select()
        .from(veristEvents)
        .where(sql`workflow_id = 'wf-1' AND run_id = 'run-1'`);

      expect(events.length).toBe(3);
      expect(events.map((e) => e.type)).toEqual([
        "extraction_started",
        "llm_call",
        "extraction_completed",
      ]);
      // All events have the same stepId
      expect(events.every((e) => e.stepId === "extract")).toBe(true);
    });

    test("shallow merge: nested objects are replaced, not deep-merged", async () => {
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { config: { a: 1, b: 2 } },
        events: [],
      });

      const result = await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-2",
        expectedVersion: 1,
        delta: { config: { c: 3 } }, // Replaces entire config object
        events: [],
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const computed = result.value.computed as Record<string, unknown>;
        // Nested object is replaced, not merged
        expect(computed.config).toEqual({ c: 3 });
      }
    });

    test("shallow merge: arrays are replaced, not concatenated", async () => {
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { tags: ["a", "b"] },
        events: [],
      });

      const result = await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-2",
        expectedVersion: 1,
        delta: { tags: ["c"] }, // Replaces entire array
        events: [],
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const computed = result.value.computed as Record<string, unknown>;
        expect(computed.tags).toEqual(["c"]);
      }
    });
  });

  describe("setOverlay", () => {
    test("adds human corrections", async () => {
      // Create initial state
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { score: 0.6 },
        events: [],
      });

      // Apply overlay
      const result = await store.setOverlay("wf-1", "run-1", { score: 0.9 });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.computed).toEqual({ score: 0.6 });
        expect(result.value.overlay).toEqual({ score: 0.9 });
        // Version should not change on overlay
        expect(result.value.version).toBe(1);
      }
    });

    test("returns not_found for missing state", async () => {
      const result = await store.setOverlay("wf-1", "run-1", { score: 0.9 });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe("not_found");
      }
    });

    test("merges overlay values (last-write-wins)", async () => {
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { score: 0.6, status: "pending" },
        events: [],
      });

      await store.setOverlay("wf-1", "run-1", { score: 0.9 });
      const result = await store.setOverlay("wf-1", "run-1", {
        status: "approved",
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Both overlay values preserved (shallow merge)
        const overlay = result.value.overlay as Record<string, unknown>;
        expect(overlay.score).toBe(0.9);
        expect(overlay.status).toBe("approved");
      }
    });
  });
});
