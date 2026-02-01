// SPDX-License-Identifier: Apache-2.0

import type { AuditEvent, Command, Step } from "@verist/core";

/**
 * Configuration for defining a pipeline.
 */
export interface PipelineConfig {
  name: string;
  /** Version stamped on each stage's workflowVersion for audit correlation. */
  workflowVersion: string;
  stages: PipelineStageConfig[];
}

/**
 * Configuration for a single pipeline stage.
 */
export interface PipelineStageConfig {
  step: Step<any, any, any>;
  /**
   * Transform data for the stage input.
   * First stage: prevDelta is undefined, use pipelineInput.
   * Subsequent stages: prevDelta is previous stage's delta.
   */
  wire?: (prevDelta: unknown, pipelineInput: unknown) => unknown;
  /** How to handle step errors. Default: "fail" */
  onError?: "fail" | "continue";
}

/**
 * A defined pipeline. Treated as immutable by convention.
 */
export interface Pipeline {
  readonly name: string;
  /** Version stamped on each stage's workflowVersion for audit correlation. */
  readonly workflowVersion: string;
  readonly stages: readonly PipelineStageConfig[];
}

/**
 * Status of a pipeline stage execution.
 */
export type StageStatus = "completed" | "failed" | "continued" | "suspended";

/**
 * Result of a single stage execution within a pipeline.
 */
export interface StageResult {
  stepName: string;
  status: StageStatus;
  /** Stage output. For continued stages, contains the value forwarded to subsequent stages. */
  delta?: unknown;
  /** Audit events. Continued stages include pipeline.stage_error (namespaced to distinguish from step events). */
  events: AuditEvent[];
  /**
   * Commands returned by the step. Not executed by pipeline runner.
   * When blockedBy="review", commands are deferred and must not be executed until review resolves.
   */
  commands?: Command[];
  durationMs: number;
  /** Present when status is "continued" or "failed" — records the error. */
  error?: PipelineError;
  /** Present when status is "suspended" — indicates which command blocked the stage. */
  blockedBy?: "suspend" | "review";
}

/**
 * Error that occurred during pipeline execution.
 * The `cause` field contains the underlying error (e.g., ZodError, thrown exception).
 */
export interface PipelineError {
  stepName: string;
  code: string;
  message: string;
  /** The underlying error that caused the failure (e.g., ZodError for validation). */
  cause?: unknown;
}

/**
 * Result of a pipeline execution.
 *
 * Note: `ok === false` means "did not complete successfully", which includes
 * both failures AND controlled suspension. Handle with:
 * - result.ok → success
 * - result.suspendedAt → suspended (not failed)
 * - else → failed (result.error is set)
 */
export interface PipelineResult<TOutput = unknown> {
  /** False means pipeline did not complete (failed OR suspended), not just "failed". */
  ok: boolean;
  runId: string;
  stages: StageResult[];
  output?: TOutput;
  /** Present on failure. Identical to the failed stage's error. */
  error?: PipelineError;
  /** Step name where pipeline suspended (on review or suspend command). */
  suspendedAt?: string;
}
