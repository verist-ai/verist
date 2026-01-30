import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
