-- @verist/storage-pg
-- schema: 0.0.1
-- generated: 2026-01-30
--
-- Apply this schema using your preferred migration tool:
--   - Drizzle: npx drizzle-kit push
--   - dbmate: dbmate up
--   - Flyway, Liquibase, etc.

-- Workflow state with layered model (ADR-003)
-- computed: AI-derived values, rewritten on recompute
-- overlay: Human corrections, never touched by automation
CREATE TABLE verist_state (
  workflow_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  computed JSONB NOT NULL DEFAULT '{}',
  overlay JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workflow_id, run_id)
);

-- Append-only audit event log (Invariant #5)
-- Events are never modified or deleted after creation
CREATE TABLE verist_events (
  id BIGSERIAL PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB,
  llm_trace JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX verist_events_run_idx ON verist_events (workflow_id, run_id);
