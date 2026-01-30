import type { Result, AuditEvent, Delta } from "@verist/core";

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
export function effectiveState<T extends Record<string, unknown>>(
  state: LayeredState<T>,
): T {
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
 * Writes state delta + events atomically.
 */
export interface CommitParams<T = unknown> {
  workflowId: string;
  runId: string;
  stepId: string;
  /** Expected current version. Must be 0 for new runs. */
  expectedVersion: number;
  delta: Delta<T>;
  events: AuditEvent[];
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
 * Structured error for storage operations.
 */
export interface StorageError {
  code: StorageErrorCode;
  message: string;
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
export interface RunStore {
  /**
   * Load current state snapshot for a workflow run.
   * Returns null if run doesn't exist.
   */
  load(
    workflowId: string,
    runId: string,
  ): Promise<Result<StateSnapshot | null, StorageError>>;

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
