// SPDX-License-Identifier: Apache-2.0

import { isErr, isOk } from "@verist/core";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createPgRunStore, type PgRunStore } from "./adapter.ts";
import {
  veristBlocks,
  veristEvents,
  veristOutbox,
  veristState,
} from "./schema.ts";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/verist_test";

describe("createPgRunStore", () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;
  let store: PgRunStore;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    db = drizzle(pool);

    // Drop and recreate tables for clean schema
    await db.execute(sql`DROP TABLE IF EXISTS verist_outbox`);
    await db.execute(sql`DROP TABLE IF EXISTS verist_blocks`);
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

    // Outbox table (ADR-010) — needed if tests use commands
    await db.execute(sql`
      CREATE TABLE verist_outbox (
        id BIGSERIAL PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        command JSONB NOT NULL,
        dedupe_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        lease_owner TEXT,
        lease_expires_at TIMESTAMPTZ,
        failures INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        dispatched_at TIMESTAMPTZ
      )
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX verist_outbox_dedupe_idx ON verist_outbox (dedupe_key)
    `);

    // Blocks table (ADR-010) — needed if tests use review/suspend
    await db.execute(sql`
      CREATE TABLE verist_blocks (
        id BIGSERIAL PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        type TEXT NOT NULL,
        reason TEXT NOT NULL,
        payload JSONB,
        resume_step TEXT,
        resolution JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved_at TIMESTAMPTZ
      )
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX verist_blocks_active_idx
      ON verist_blocks (workflow_id, run_id)
      WHERE resolved_at IS NULL
    `);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store = createPgRunStore({ db: db as any });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean tables before each test
    await db.delete(veristOutbox);
    await db.delete(veristBlocks);
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
        expect(result.error.reason).toBe("run_exists");
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
        expect(result.error.reason).toBe("version_mismatch");
      }
    });

    test("returns conflict when run already has an active block", async () => {
      // Create initial state with a review block
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { status: "pending" },
        events: [],
        commands: [{ type: "review", reason: "first review" }],
      });

      // Try to commit another blocking command while first is unresolved
      const result = await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-2",
        expectedVersion: 1,
        delta: { status: "blocked" },
        events: [],
        commands: [
          { type: "suspend", reason: "wait for callback", checkpoint: {} },
        ],
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe("conflict");
        expect(result.error.reason).toBe("active_block");
      }
    });

    test("suspend discards sibling commands (workflow pauses)", async () => {
      const result = await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { status: "suspended" },
        events: [],
        commands: [
          { type: "suspend", reason: "waiting for callback", checkpoint: {} },
          { type: "invoke", step: "next-step", input: { data: "test" } },
        ],
      });

      expect(isOk(result)).toBe(true);

      // Block should be created
      const blocks = await db
        .select()
        .from(veristBlocks)
        .where(sql`workflow_id = 'wf-1' AND run_id = 'run-1'`);
      expect(blocks.length).toBe(1);
      expect(blocks[0]?.type).toBe("suspend");

      // Outbox should be empty (sibling invoke discarded)
      const outbox = await db
        .select()
        .from(veristOutbox)
        .where(sql`workflow_id = 'wf-1' AND run_id = 'run-1'`);
      expect(outbox.length).toBe(0);
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

  describe("leaseOutbox", () => {
    test("does not lease deferred commands", async () => {
      // Create a run with review block (commands become deferred)
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { status: "pending" },
        events: [],
        commands: [
          { type: "review", reason: "needs approval" },
          { type: "invoke", step: "next-step", input: { data: "test" } },
        ],
      });

      // Verify command is deferred
      const outbox = await db
        .select()
        .from(veristOutbox)
        .where(sql`workflow_id = 'wf-1' AND run_id = 'run-1'`);
      expect(outbox.length).toBe(1);
      expect(outbox[0]?.status).toBe("deferred");

      // Lease should return empty (deferred commands not eligible)
      const leaseResult = await store.leaseOutbox("dispatcher-1", 10);
      expect(isOk(leaseResult)).toBe(true);
      if (isOk(leaseResult)) {
        expect(leaseResult.value.length).toBe(0);
      }

      // Verify entry is still deferred (not mutated by failed lease attempt)
      const afterLease = await db
        .select()
        .from(veristOutbox)
        .where(sql`workflow_id = 'wf-1' AND run_id = 'run-1'`);
      expect(afterLease[0]?.status).toBe("deferred");
    });

    test("markDispatched returns lease_mismatch and leaves row unchanged if owned by different dispatcher", async () => {
      // Create a pending outbox entry
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { status: "active" },
        events: [],
        commands: [{ type: "invoke", step: "next", input: {} }],
      });

      // Lease by dispatcher-1
      const leaseResult = await store.leaseOutbox("dispatcher-1", 10);
      expect(isOk(leaseResult)).toBe(true);
      if (!isOk(leaseResult)) throw new Error("Expected ok");
      expect(leaseResult.value.length).toBe(1);
      const entry = leaseResult.value[0]!;

      // Try to mark dispatched as dispatcher-2 (wrong owner)
      const markResult = await store.markDispatched(entry.id, "dispatcher-2");
      expect(isErr(markResult)).toBe(true);
      if (isErr(markResult)) {
        expect(markResult.error.code).toBe("conflict");
        expect(markResult.error.reason).toBe("lease_mismatch");
      }

      // Row should be completely unchanged
      const afterMark = await db
        .select()
        .from(veristOutbox)
        .where(sql`workflow_id = 'wf-1' AND run_id = 'run-1'`);
      expect(afterMark[0]?.status).toBe("leased");
      expect(afterMark[0]?.leaseOwner).toBe("dispatcher-1");
      expect(afterMark[0]?.dispatchedAt).toBeNull();
      expect(afterMark[0]?.lastError).toBeNull();
    });

    test("markFailed increments failures and sets lastError", async () => {
      // Create a pending outbox entry
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { status: "active" },
        events: [],
        commands: [{ type: "invoke", step: "next", input: {} }],
      });

      // Lease and fail
      const leaseResult = await store.leaseOutbox("dispatcher-1", 10);
      if (!isOk(leaseResult)) throw new Error("Expected ok");
      const entry = leaseResult.value[0]!;

      const failResult = await store.markFailed(
        entry.id,
        "dispatcher-1",
        "connection timeout",
      );
      expect(isOk(failResult)).toBe(true);

      // Verify failures incremented and lastError set
      const afterFail = await db
        .select()
        .from(veristOutbox)
        .where(sql`workflow_id = 'wf-1' AND run_id = 'run-1'`);
      expect(afterFail[0]?.status).toBe("failed");
      expect(afterFail[0]?.failures).toBe(1);
      expect(afterFail[0]?.lastError).toBe("connection timeout");
      expect(afterFail[0]?.leaseOwner).toBeNull();
      expect(afterFail[0]?.leaseExpiresAt).toBeNull();
    });

    test("expired lease can be reclaimed by another dispatcher", async () => {
      // Create a pending outbox entry
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { status: "active" },
        events: [],
        commands: [{ type: "invoke", step: "next", input: {} }],
      });

      // Lease by dispatcher-1 with short duration (10ms, with 50ms margin for CI)
      const leaseResult1 = await store.leaseOutbox("dispatcher-1", 10, 10);
      if (!isOk(leaseResult1)) throw new Error("Expected ok");
      expect(leaseResult1.value.length).toBe(1);
      const entry = leaseResult1.value[0]!;

      // Wait for lease to expire (generous margin for CI environments)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // dispatcher-2 can reclaim the expired lease
      const leaseResult2 = await store.leaseOutbox("dispatcher-2", 10);
      if (!isOk(leaseResult2)) throw new Error("Expected ok");
      expect(leaseResult2.value.length).toBe(1);
      expect(leaseResult2.value[0]!.id).toBe(entry.id);

      // Verify dispatcher-2 owns the lease now
      const afterReclaim = await db
        .select()
        .from(veristOutbox)
        .where(sql`workflow_id = 'wf-1' AND run_id = 'run-1'`);
      expect(afterReclaim[0]?.status).toBe("leased");
      expect(afterReclaim[0]?.leaseOwner).toBe("dispatcher-2");

      // dispatcher-2 can finalize successfully
      const markResult = await store.markDispatched(entry.id, "dispatcher-2");
      expect(isOk(markResult)).toBe(true);
    });
  });

  describe("resolveBlock", () => {
    test("review only affects deferred commands from the same stepId", async () => {
      // Create run with review block from step-1
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { status: "pending" },
        events: [],
        commands: [
          { type: "review", reason: "review gate" },
          { type: "invoke", step: "after-review", input: {} },
        ],
      });

      // Manually insert a deferred command from different stepId
      await db.insert(veristOutbox).values({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-2", // Different stepId
        command: { type: "invoke", step: "other-step", input: {} },
        dedupeKey: "other-dedupe-key",
        status: "deferred",
        createdAt: new Date(),
      });

      // Resolve the review (approve)
      const resolveResult = await store.resolveBlock("wf-1", "run-1", {
        approved: true,
      });
      expect(isOk(resolveResult)).toBe(true);

      // Check outbox statuses
      const outbox = await db
        .select()
        .from(veristOutbox)
        .where(sql`workflow_id = 'wf-1' AND run_id = 'run-1'`);

      // step-1 command should be pending (approved)
      const step1Cmd = outbox.find((e) => e.stepId === "step-1");
      expect(step1Cmd?.status).toBe("pending");

      // step-2 command should still be deferred (not touched)
      const step2Cmd = outbox.find((e) => e.stepId === "step-2");
      expect(step2Cmd?.status).toBe("deferred");

      // Block should be resolved (resolved_at set)
      const blocks = await db
        .select()
        .from(veristBlocks)
        .where(sql`workflow_id = 'wf-1' AND run_id = 'run-1'`);
      expect(blocks.length).toBe(1);
      expect(blocks[0]?.resolvedAt).not.toBeNull();
    });

    test("resolveBlock returns null for non-existent run (idempotent)", async () => {
      // No run exists for wf-1/run-1
      const result = await store.resolveBlock("wf-1", "run-nonexistent", {
        approved: true,
      });
      if (!isOk(result)) throw new Error("Expected ok");
      expect(result.value).toBeNull();
    });

    test("resolveBlock returns null when called twice (idempotent)", async () => {
      // Create run with review block
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { status: "pending" },
        events: [],
        commands: [{ type: "review", reason: "review gate" }],
      });

      // First resolve should succeed with block info
      const result1 = await store.resolveBlock("wf-1", "run-1", {
        approved: true,
      });
      if (!isOk(result1)) throw new Error("Expected ok");
      expect(result1.value).not.toBeNull();
      expect(result1.value?.type).toBe("review");

      // Second resolve should return null (already resolved)
      const result2 = await store.resolveBlock("wf-1", "run-1", {
        approved: false, // Different resolution, but should be ignored
      });
      if (!isOk(result2)) throw new Error("Expected ok");
      expect(result2.value).toBeNull();
    });

    test("suspend resolveBlock is idempotent with ON CONFLICT", async () => {
      // Create run with suspend block
      await store.commit({
        workflowId: "wf-1",
        runId: "run-1",
        stepId: "step-1",
        expectedVersion: 0,
        delta: { status: "suspended" },
        events: [],
        commands: [
          {
            type: "suspend",
            reason: "awaiting input",
            checkpoint: {},
            resumeStep: "resume-handler",
          },
        ],
      });

      // First resolve creates resume command
      const result1 = await store.resolveBlock("wf-1", "run-1", {
        resumeData: { value: "first" },
      });
      if (!isOk(result1)) throw new Error("Expected ok");
      expect(result1.value?.type).toBe("suspend");

      // Check outbox has one resume command
      const outbox1 = await db
        .select()
        .from(veristOutbox)
        .where(sql`workflow_id = 'wf-1' AND run_id = 'run-1'`);
      expect(outbox1.length).toBe(1);
      expect(outbox1[0]?.status).toBe("pending");

      // Second resolve returns null (already resolved)
      const result2 = await store.resolveBlock("wf-1", "run-1", {
        resumeData: { value: "second" },
      });
      if (!isOk(result2)) throw new Error("Expected ok");
      expect(result2.value).toBeNull();

      // Still only one resume command (ON CONFLICT DO NOTHING)
      const outbox2 = await db
        .select()
        .from(veristOutbox)
        .where(sql`workflow_id = 'wf-1' AND run_id = 'run-1'`);
      expect(outbox2.length).toBe(1);
    });
  });
});
