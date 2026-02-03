// SPDX-License-Identifier: Apache-2.0

import type { Delta, StepOutput } from "@verist/core";

/**
 * Classification of what an artifact represents.
 *
 * **Reserved by kernel:**
 * - `"step-output"` — step's delta + events, used by replay/recompute
 * - `"step-commands"` — step's commands, used by recompute command diffing
 *
 * **User-defined:** Any other value (e.g., `"llm-input"`, `"llm-output"`) is
 * opaque metadata for audit/tracing. The kernel does not interpret these.
 */
export type ArtifactKind = "step-output" | "step-commands" | (string & {});

/**
 * A captured non-deterministic value with its content hash.
 * Artifacts enable exact replay by storing values that would otherwise vary.
 */
export interface Artifact {
  /** SHA-256 hash of the content */
  hash: string;
  /** @see ArtifactKind */
  kind: ArtifactKind;
  /** The actual content. Optional for compliance scenarios where content cannot be persisted. */
  content?: unknown;
}

/**
 * A point-in-time capture of step execution.
 * Contains input, output, and artifacts for verification and recomputation.
 */
export interface Snapshot {
  /** Workflow identifier */
  workflowId: string;
  /** Workflow version at capture time */
  workflowVersion: string;
  /** Name of the step that was executed */
  stepName: string;
  /** Input passed to the step */
  input: unknown;
  /** Hash of the input for quick comparison */
  inputHash: string;
  /** Artifacts captured during execution */
  artifacts: Artifact[];
  /** Unix timestamp (ms) when snapshot was created */
  capturedAt: number;
}

/**
 * A single change between two values.
 */
export interface DiffEntry {
  /** Path to the changed value (array of keys/indices) */
  path: (string | number)[];
  /** Value before the change (undefined if added) */
  before: unknown;
  /** Value after the change (undefined if removed) */
  after: unknown;
}

/**
 * Result of comparing two values.
 */
export interface DiffResult {
  /** True if values are structurally equal */
  equal: boolean;
  /** List of differences (empty if equal) */
  entries: DiffEntry[];
}

/**
 * Options for capturing artifacts.
 */
export interface CaptureOptions {
  /** If true, omit content from artifact (hash only) */
  hashOnly?: boolean;
}

/**
 * Parameters for creating a snapshot.
 */
export interface CreateSnapshotParams {
  workflowId: string;
  workflowVersion: string;
  stepName: string;
  input: unknown;
  artifacts: Artifact[];
}

/**
 * Layered state structure for diff operations.
 * Compatible with @verist/storage LayeredState without coupling.
 */
export interface LayeredStateInput<T> {
  computed: T;
  overlay: Partial<T>;
}

/**
 * A single schema violation detected during output validation.
 * Machine-readable: `kind` enables grouping and counting without parsing messages.
 */
export interface SchemaViolation {
  /** Path to the violating value (Zod issue path) */
  path: (string | number)[];
  /** Stable discriminator for the violation category */
  kind: "missing" | "type" | "refinement" | "other";
  /** Human-readable description */
  message: string;
}

/**
 * Highest-severity classification of a recompute result.
 *
 * - `"clean"` — no value changes, no schema violations
 * - `"value_changed"` — value diffs only, no schema violations
 * - `"schema_violation"` — schema violations present (value changes may also exist)
 *
 * Status reflects output semantics only — command changes are orthogonal.
 * When `comparable` is `false`, `"clean"` means no schema violations were found,
 * not that values were verified equal (value comparison did not run).
 */
export type RecomputeStatus = "clean" | "value_changed" | "schema_violation";

/**
 * Result of recomputation including diffs from original.
 */
export interface RecomputeResult<TDelta> {
  /** Raw recomputed output (always present, typed as `unknown` — use `parsedDelta` for typed access) */
  output: StepOutput<unknown>;
  /**
   * Zod-parsed delta, only present when output validation succeeds.
   * Reflects transforms, defaults, and coercions applied by the schema.
   */
  parsedDelta?: Delta<TDelta>;
  /** Highest-severity classification of the result */
  status: RecomputeStatus;
  /**
   * Whether the baseline had content available for structural comparison.
   * `false` when baseline is hash-only, missing, or malformed (no `delta` key).
   * Schema violations can exist with `comparable: true`.
   */
  comparable: boolean;
  /**
   * Diff between original and recomputed delta (state changes).
   * `undefined` when `comparable` is `false`.
   */
  deltaDiff: DiffResult | undefined;
  /**
   * Diff between original and recomputed commands (control-flow decisions).
   * `undefined` if original commands are unavailable for comparison.
   */
  commandsDiff: DiffResult | undefined;
  /** Schema violations detected during output validation (empty if none) */
  schemaViolations: SchemaViolation[];
  /** Captured artifact of the recomputed output (when captureArtifacts option is set) */
  outputArtifact?: Artifact;
}
