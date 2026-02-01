// SPDX-License-Identifier: Apache-2.0

import { sql } from "drizzle-orm";
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Workflow state with layered model (ADR-003).
 *
 * - computed: AI-derived values, rewritten on recompute
 * - overlay: Human corrections, never touched by automation
 * - effective: Derived at read time as { ...computed, ...overlay } (not stored)
 */
export const veristState = pgTable(
  "verist_state",
  {
    workflowId: text("workflow_id").notNull(),
    runId: text("run_id").notNull(),
    /** Optimistic lock version. Incremented on each commit. */
    version: integer("version").notNull().default(0),
    computed: jsonb("computed").notNull().default({}),
    overlay: jsonb("overlay").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workflowId, t.runId] })],
);

/**
 * Append-only audit event log (Invariant #5).
 *
 * Events are never modified or deleted after creation.
 * llmTrace may omit input/output for compliance (hashes are mandatory).
 */
export const veristEvents = pgTable(
  "verist_events",
  {
    /** Event ID. Use as string in application code to avoid precision loss. */
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    workflowId: text("workflow_id").notNull(),
    runId: text("run_id").notNull(),
    stepId: text("step_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload"),
    llmTrace: jsonb("llm_trace"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("verist_events_run_idx").on(t.workflowId, t.runId)],
);

/**
 * Command outbox for reliable dispatch (ADR-010).
 *
 * Commands are written atomically with state commit, then dispatched
 * to the queue by a separate process. Lease fields prevent duplicate
 * processing by concurrent dispatchers.
 */
export const veristOutbox = pgTable(
  "verist_outbox",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    workflowId: text("workflow_id").notNull(),
    runId: text("run_id").notNull(),
    stepId: text("step_id").notNull(),
    /** The command payload (invoke, fanout, emit, etc). */
    command: jsonb("command").notNull(),
    /**
     * Deterministic key: hash(workflowId, runId, stepId, command).
     * Used as queue job ID for deduplication.
     */
    dedupeKey: text("dedupe_key").notNull(),
    /**
     * Command status:
     * - pending: Ready to dispatch
     * - deferred: Held for review approval
     * - leased: Claimed by dispatcher
     * - dispatched: Successfully enqueued (terminal)
     * - rejected: Review rejected (terminal)
     * - failed: Explicit operator action (terminal, reserved)
     */
    status: text("status").notNull().default("pending"),
    /** Dispatcher instance that holds the lease. */
    leaseOwner: text("lease_owner"),
    /**
     * When the lease expires. Expired leases can be reclaimed by any
     * dispatcher regardless of owner — this is intentional to handle
     * dispatcher crashes.
     */
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    /** Number of failed dispatch attempts. Incremented by markFailed(). */
    failures: integer("failures").notNull().default(0),
    /** Last error message if dispatch failed. */
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("verist_outbox_dedupe_idx").on(t.dedupeKey),
    index("verist_outbox_pending_idx").on(t.status, t.createdAt),
  ],
);

/**
 * Unified blocking state for review and suspend commands (ADR-010).
 *
 * Both review and suspend block workflow progression until external
 * input resolves them. Using a single table with type discriminator
 * avoids parallel subsystems that drift.
 *
 * Invariant: At most one active (unresolved) block per run.
 */
export const veristBlocks = pgTable(
  "verist_blocks",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    workflowId: text("workflow_id").notNull(),
    runId: text("run_id").notNull(),
    stepId: text("step_id").notNull(),
    /** Block type: 'review' or 'suspend'. */
    type: text("type").notNull(),
    /** Why the workflow is blocked. */
    reason: text("reason").notNull(),
    /**
     * Block-specific data:
     * - review: Optional payload for reviewer context
     * - suspend: Checkpoint data for resume
     */
    payload: jsonb("payload"),
    /** For suspend: which step handles resume (defaults to suspending step). */
    resumeStep: text("resume_step"),
    /**
     * Resolution data (set once on resolve):
     * - review: { approved: boolean }
     * - suspend: { resumeData: unknown }
     */
    resolution: jsonb("resolution"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    // At most one active block per run (partial unique index).
    // Prevents deadlock from multiple unresolved blocks.
    uniqueIndex("verist_blocks_active_idx")
      .on(t.workflowId, t.runId)
      .where(sql`${t.resolvedAt} IS NULL`),
    index("verist_blocks_pending_idx").on(t.workflowId, t.runId),
  ],
);
