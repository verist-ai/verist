// Types
export type {
  Artifact,
  Snapshot,
  DiffEntry,
  DiffResult,
  CaptureOptions,
  CreateSnapshotParams,
  GetArtifact,
  RecomputeResult,
  LayeredStateInput,
} from "./types.ts";

// Hash utilities
export { hashValue, hashWithContent } from "./hash.ts";

// Artifact capture
export type { SnapshotFromResultOptions } from "./artifact.ts";
export {
  captureArtifact,
  createSnapshot,
  createSnapshotFromResult,
} from "./artifact.ts";

// Diff utilities
export { diff, applyDiff, formatDiff, diffEffectiveState } from "./diff.ts";

// Replay
export type {
  ReplayContext,
  ReplayResult,
  ReplayError,
  ReplayErrorCode,
} from "./replay.ts";
export { replay, createReplayContext } from "./replay.ts";

// Recompute
export type {
  RecomputeOptions,
  RecomputeError,
  RecomputeErrorCode,
} from "./recompute.ts";
export { recompute, compareSnapshots } from "./recompute.ts";
