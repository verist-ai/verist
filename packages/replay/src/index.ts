// Types
export type {
  Artifact,
  ArtifactKind,
  CaptureOptions,
  CreateSnapshotParams,
  DiffEntry,
  DiffResult,
  LayeredStateInput,
  RecomputeResult,
  Snapshot,
} from "./types.ts";

// Hash utilities
export { hashValue, hashWithContent } from "./hash.ts";

// Artifact capture
export {
  captureArtifact,
  createSnapshot,
  createSnapshotFromResult,
  normalizeCommands,
  RESERVED_ARTIFACT_KINDS,
} from "./artifact.ts";
export type { SnapshotFromResultOptions } from "./artifact.ts";

// Diff utilities
export { applyDiff, diff, diffEffectiveState, formatDiff } from "./diff.ts";

// Load stored output
export { loadOutput } from "./replay.ts";
export type { LoadOutputError, LoadOutputErrorCode } from "./replay.ts";

// Recompute
export { compareSnapshots, recompute } from "./recompute.ts";
export type {
  RecomputeError,
  RecomputeErrorCode,
  RecomputeOptions,
} from "./recompute.ts";
