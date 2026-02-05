// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type { Artifact } from "./artifact.ts";
import type { StepOutput } from "./step.ts";

// ── Utility types ──────────────────────────────────────────────────────────

/**
 * Partial state update. Use for step output deltas.
 * Allows returning only changed fields.
 */
export type Delta<T> = Partial<T>;

/**
 * Infer TypeScript type from Zod schema.
 * Convenience re-export of z.infer.
 */
export type Infer<T extends z.ZodType> = z.infer<T>;

/**
 * Base constraint for adapter objects.
 * Allows any object shape — users define their own adapter interfaces.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type BaseAdapters = {};

/**
 * Conditional type that makes `adapters` optional when TAdapters is empty.
 * Used by RunOptions and RecomputeOptions to avoid `adapters: {}` boilerplate.
 */
export type AdaptersOption<TAdapters extends BaseAdapters> = [
  keyof TAdapters,
] extends [never]
  ? { adapters?: TAdapters }
  : { adapters: TAdapters };

/**
 * Rest-tuple type that makes the options argument optional when TAdapters is
 * empty, and required when the step declares adapters. Used as `...args` in
 * function signatures to get conditional optionality without overloads.
 */
export type OptionsArg<TAdapters extends BaseAdapters, TOptions> = [
  keyof TAdapters,
] extends [never]
  ? [options?: TOptions]
  : [options: TOptions];

// ── Replay / snapshot types ────────────────────────────────────────────────

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
  /** Raw recomputed output, typed as `unknown` because recompute is observational and output may not conform to current schemas. Use `parsedDelta` for typed access. */
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
