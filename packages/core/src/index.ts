// SPDX-License-Identifier: Apache-2.0

// Artifact capture and hashing
export { createArtifact, hashValue, stableStringify } from "./artifact.ts";
export type { Artifact, OnArtifact } from "./artifact.ts";

// Result type and helpers
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

// Utility types
export type { BaseAdapters, Delta, Infer } from "./types.ts";

// Audit events
export { AuditEventSchema, LLMTraceSchema } from "./event.ts";
export type { AuditEvent, LLMTrace } from "./event.ts";

// Commands
export {
  CommandSchema,
  emit,
  EmitCommandSchema,
  fanout,
  FanoutCommandSchema,
  invoke,
  InvokeCommandSchema,
  isBlockingCommand,
  isControlCommand,
  isSideEffectCommand,
  review,
  ReviewCommandSchema,
  suspend,
  SuspendCommandSchema,
} from "./command.ts";
export type {
  Command,
  EmitCommand,
  FanoutCommand,
  InvokeCommand,
  ReviewCommand,
  SuspendCommand,
} from "./command.ts";

// Context
export { createContextFactory } from "./context.ts";
export type {
  ContextFactory,
  ExecutionMetadata,
  StepContext,
} from "./context.ts";

// Step
export { defineStep } from "./step.ts";
export type { Step, StepConfig, StepOutput } from "./step.ts";

// Workflow
export { defineWorkflow } from "./workflow.ts";
export type { AnyStep, Workflow, WorkflowConfig } from "./workflow.ts";

// Run
export { run, runStep } from "./run.ts";
export type {
  RunOptions,
  RunStepInput,
  StepError,
  StepErrorCode,
  StepResult,
} from "./run.ts";
