// SPDX-License-Identifier: Apache-2.0

import type { AuditEvent, Command, Step, StepError } from "@verist/core";

/**
 * Configuration for defining a pipeline.
 */
export interface PipelineConfig {
  name: string;
  version: string;
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
  onError?: "fail" | "skip";
}

/**
 * A defined pipeline. Treated as immutable by convention.
 */
export interface Pipeline {
  readonly name: string;
  readonly version: string;
  readonly stages: readonly PipelineStageConfig[];
}

/**
 * Status of a pipeline stage execution.
 */
export type StageStatus = "completed" | "failed" | "skipped" | "suspended";

/**
 * Result of a single stage execution within a pipeline.
 */
export interface StageResult {
  stepName: string;
  status: StageStatus;
  /** Stage output. For skipped stages, contains the carry-forward delta from previous stage. */
  delta?: unknown;
  /** Audit events from step execution. Empty for skipped/failed stages. */
  events: AuditEvent[];
  /** Commands returned by the step. Not executed by pipeline runner. */
  commands?: Command[];
  durationMs: number;
  /** Present when status is "skipped" or "failed" — records the error. */
  error?: PipelineError;
  /** Present when status is "suspended" — indicates which command blocked the stage. */
  blockedBy?: "suspend" | "review";
}

/**
 * Error that occurred during pipeline execution.
 */
export interface PipelineError {
  stepName: string;
  code: string;
  message: string;
  cause?: StepError;
}

/**
 * Result of a pipeline execution.
 */
export interface PipelineResult<TOutput = unknown> {
  ok: boolean;
  runId: string;
  stages: StageResult[];
  output?: TOutput;
  /** Present on failure. Identical to the failed stage's error. */
  error?: PipelineError;
  /** Step name where pipeline suspended (on review or suspend command) */
  suspendedAt?: string;
}
