// SPDX-License-Identifier: Apache-2.0

import type { AuditEvent, Command, Delta, Result } from "verist";

/**
 * Three-layer state model (ADR-003).
 *
 * - computed: AI-derived values, rewritten on recompute
 * - overlay: Human corrections, never touched by automation
 * - effective: Read-only merge where overlay wins
 */
export interface LayeredState<T> {
  computed: T;
  overlay: Partial<T>;
}

/**
 * Compute effective state via shallow merge: { ...computed, ...overlay }.
 * Overlay keys take precedence over computed values.
 * Note: explicit undefined in overlay will override computed (avoid storing undefined).
 */
// `object` not `Record<string, unknown>` — TS interfaces lack implicit index signatures
export function effectiveState<T extends object>(state: LayeredState<T>): T {
  return { ...state.computed, ...state.overlay };
}

/**
 * Point-in-time state snapshot with layers.
 */
export interface StateSnapshot<T = unknown> {
  workflowId: string;
  runId: string;
  version: number;
  computed: T;
  overlay: Partial<T>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Parameters for committing a step result.
 * Writes state delta + events + commands atomically.
 */
export interface CommitParams<T = unknown> {
  workflowId: string;
  runId: string;
  stepId: string;
  /** Expected current version. Must be 0 for new runs. */
  expectedVersion: number;
  /**
   * Partial update to computed state. Omitted keys are preserved from previous computed.
   * For initial commits (expectedVersion === 0), must represent the full computed state.
   */
  delta: Delta<T>;
  events: AuditEvent[];
  /**
   * Commands to write to outbox atomically with state commit.
   *
   * **Suspend semantics:** If commands includes a `suspend` command, sibling
   * commands are not persisted (workflow pauses until resume). Only the
   * suspend block is created.
   */
  commands?: Command[];
}

/**
 * Error codes for storage operations.
 */
export type StorageErrorCode =
  | "not_found"
  | "conflict"
  | "connection_error"
  | "serialization_error";

/**
 * Conflict reason for typed error handling.
 *
 * Storage Adapter Contract: adapters MUST set `reason` when returning
 * `code: "conflict"`. Runners depend on this for retry/fatal classification.
 */
export type ConflictReason =
  | "run_exists" // expectedVersion was 0 but run already exists
  | "version_mismatch" // optimistic lock failed (concurrent update)
  | "active_block" // run already has an unresolved block
  | "command_exists" // outbox command with same dedupe key exists
  | "lease_mismatch"; // outbox entry not finalizable by this owner

/**
 * Structured error for storage operations.
 */
export interface StorageError {
  code: StorageErrorCode;
  message: string;
  /**
   * Present when code is "conflict" — enables typed retry/fatal handling.
   * Storage adapters MUST set this for conflict errors.
   */
  reason?: ConflictReason;
}

/**
 * Run storage interface.
 * Manages workflow state and audit events with atomic commits.
 *
 * ## Storage Contract
 *
 * **Concurrency:**
 * - `commit()` uses optimistic locking via `expectedVersion`
 * - Returns `conflict` if version mismatch
 * - First commit must have `expectedVersion: 0`
 *
 * **Merge Semantics:**
 * - Shallow merge only (JSONB `||` in Postgres)
 * - No key deletion (use explicit tombstone values if needed)
 *
 * **Overlay:**
 * - `setOverlay()` is last-write-wins (no versioning)
 * - Human corrections take precedence over computed values
 *
 * **Events:**
 * - Append-only (never modified or deleted)
 * - Written atomically with state in `commit()`
 */
// In-memory store for examples and tests
export { createMemoryStore } from "./memory.ts";

export interface RunStore {
  /**
   * Load current state snapshot for a workflow run.
   * Returns `err({ code: "not_found" })` if run doesn't exist.
   * `T` is a type hint only; adapters do not validate persisted data.
   */
  load<T = unknown>(
    workflowId: string,
    runId: string,
  ): Promise<Result<StateSnapshot<T>, StorageError>>;

  /**
   * Commit state delta + events atomically.
   *
   * - Creates new run if `expectedVersion === 0`
   * - Returns `conflict` if version mismatch or if `expectedVersion !== 0` for new run
   * - Events are written with the provided `stepId`
   */
  commit<T>(
    params: CommitParams<T>,
  ): Promise<Result<StateSnapshot<T>, StorageError>>;

  /**
   * Apply human correction to overlay layer.
   * Last-write-wins semantics (no versioning).
   * Overlay values take precedence over computed values.
   */
  setOverlay<T>(
    workflowId: string,
    runId: string,
    overlay: Partial<T>,
  ): Promise<Result<StateSnapshot<T>, StorageError>>;
}

/**
 * A RunStore with a fixed state type parameter.
 * Eliminates repeated `<T>` at each call site.
 */
export interface TypedStore<T> {
  load(
    workflowId: string,
    runId: string,
  ): Promise<Result<StateSnapshot<T>, StorageError>>;

  commit(
    params: CommitParams<T>,
  ): Promise<Result<StateSnapshot<T>, StorageError>>;

  setOverlay(
    workflowId: string,
    runId: string,
    overlay: Partial<T>,
  ): Promise<Result<StateSnapshot<T>, StorageError>>;
}

/**
 * Bind a state type to a RunStore, removing repeated `<T>` at each call site.
 *
 * @example
 * const store = typedStore<AppState>(createMemoryStore());
 * const result = await store.commit({...}); // T is AppState
 */
export function typedStore<T>(store: RunStore): TypedStore<T> {
  return {
    load: (workflowId, runId) => store.load<T>(workflowId, runId),
    commit: (params) => store.commit<T>(params),
    setOverlay: (workflowId, runId, overlay) =>
      store.setOverlay<T>(workflowId, runId, overlay),
  };
}
