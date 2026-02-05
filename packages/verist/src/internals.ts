// SPDX-License-Identifier: Apache-2.0

/**
 * Internal APIs consumed by sibling packages (@verist/cli, @verist/llm,
 * @verist/storage, @verist/storage-pg). Not part of the public API — may
 * change without notice.
 */

// ── Artifact internals ────────────────────────────────────────────────────

export { createArtifact, hashValue, stableStringify } from "./artifact.ts";

// ── Audit event schemas ───────────────────────────────────────────────────

export { AuditEventSchema, LLMTraceSchema } from "./event.ts";

// ── Command schemas and type guards ───────────────────────────────────────

export {
  CommandSchema,
  EmitCommandSchema,
  FanoutCommandSchema,
  InvokeCommandSchema,
  isBlockingCommand,
  isControlCommand,
  isSideEffectCommand,
  ReviewCommandSchema,
  SuspendCommandSchema,
} from "./command.ts";

// ── Snapshot internals ────────────────────────────────────────────────────

export {
  captureArtifact,
  createSnapshot,
  normalizeCommands,
  RESERVED_ARTIFACT_KINDS,
} from "./snapshot.ts";

// ── Hash utilities ────────────────────────────────────────────────────────

export { hashWithContent } from "./hash.ts";

// ── Diff internals ────────────────────────────────────────────────────────

export { diffEffectiveState, formatPath } from "./diff.ts";

// ── Replay internals ──────────────────────────────────────────────────────

export { loadOutput } from "./replay.ts";
export type { LoadOutputError, LoadOutputErrorCode } from "./replay.ts";
