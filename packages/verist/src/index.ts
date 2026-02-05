// SPDX-License-Identifier: Apache-2.0

// ── Result type ────────────────────────────────────────────────────────────

export {
  err,
  flatMap,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  unwrap,
} from "./result.ts";
export type { Result } from "./result.ts";

// ── Utility types ──────────────────────────────────────────────────────────

export type {
  AdaptersOption,
  BaseAdapters,
  Delta,
  Infer,
  OptionsArg,
} from "./types.ts";

// ── Artifact ───────────────────────────────────────────────────────────────

export type { Artifact, ArtifactKind, OnArtifact } from "./artifact.ts";

// ── Audit events ───────────────────────────────────────────────────────────

export type { AuditEvent, LLMTrace } from "./event.ts";

// ── Commands ───────────────────────────────────────────────────────────────

export { emit, fanout, invoke, review, suspend } from "./command.ts";
export type {
  Command,
  EmitCommand,
  FanoutCommand,
  InvokeCommand,
  ReviewCommand,
  SuspendCommand,
} from "./command.ts";

// ── Context ────────────────────────────────────────────────────────────────

export { createContextFactory } from "./context.ts";
export type {
  ContextFactory,
  ExecutionMetadata,
  StepContext,
} from "./context.ts";

// ── Step ───────────────────────────────────────────────────────────────────

export { defineStep } from "./step.ts";
export type {
  Step,
  StepConfig,
  StepDelta,
  StepInput,
  StepOutput,
} from "./step.ts";

// ── Workflow ───────────────────────────────────────────────────────────────

export { defineWorkflow } from "./workflow.ts";
export type { AnyStep, Workflow, WorkflowConfig } from "./workflow.ts";

// ── Run ────────────────────────────────────────────────────────────────────

export { run, runStep } from "./run.ts";
export type {
  RunOptions,
  RunStepInput,
  StepError,
  StepErrorCode,
  StepResult,
} from "./run.ts";

// ── Snapshot / capture ─────────────────────────────────────────────────────

export { createSnapshotFromResult } from "./snapshot.ts";
export type { SnapshotFromResultOptions } from "./snapshot.ts";
export type {
  CaptureOptions,
  CreateSnapshotParams,
  Snapshot,
} from "./types.ts";

// ── Diff ───────────────────────────────────────────────────────────────────

export { applyDiff, diff, formatDiff } from "./diff.ts";
export type { DiffEntry, DiffResult, LayeredStateInput } from "./types.ts";

// ── Recompute ──────────────────────────────────────────────────────────────

export { compareSnapshots, recompute } from "./recompute.ts";
export type {
  RecomputeError,
  RecomputeErrorCode,
  RecomputeOptions,
} from "./recompute.ts";
export type {
  RecomputeResult,
  RecomputeStatus,
  SchemaViolation,
} from "./types.ts";
