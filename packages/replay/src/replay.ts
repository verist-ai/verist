import type { Result } from "@verist/core";
import { ok, err } from "@verist/core";
import type { Snapshot, GetArtifact, Artifact } from "./types.ts";

/**
 * Replay context that provides artifact retrieval during step execution.
 * Wraps adapters to intercept non-deterministic calls and return stored values.
 */
export interface ReplayContext {
  /** Retrieve an artifact by hash */
  getArtifact: GetArtifact;
  /** All artifacts from the snapshot, indexed by hash */
  artifacts: Map<string, Artifact>;
}

/**
 * Result of replaying a snapshot.
 */
export interface ReplayResult<T> {
  /** The replayed output */
  output: T;
  /** Artifacts used during replay */
  usedArtifacts: Artifact[];
}

/**
 * Replay error types.
 */
export type ReplayErrorCode =
  | "MISSING_OUTPUT"
  | "MISSING_ARTIFACT"
  | "HASH_MISMATCH";

export interface ReplayError {
  code: ReplayErrorCode;
  message: string;
}

/**
 * Replay a snapshot using stored artifacts.
 *
 * Exact replay means the output should be byte-identical to the original
 * execution when using the same artifacts. This requires that:
 * 1. All non-deterministic inputs were captured as artifacts
 * 2. The step function is pure given those inputs
 *
 * Returns Result per Invariant #9 (Errors are Values).
 *
 * @example
 * ```typescript
 * const result = await replay(snapshot, async (hash) => {
 *   return artifactStore.get(hash);
 * });
 * if (result.ok) {
 *   console.log(result.value.output);
 * }
 * ```
 */
export async function replay<T>(
  snapshot: Snapshot,
  _getArtifact: GetArtifact,
): Promise<Result<ReplayResult<T>, ReplayError>> {
  const usedArtifacts: Artifact[] = [];

  // The actual replay execution depends on how the step was captured.
  // For now, return the stored output artifact if available.
  const outputArtifact = snapshot.artifacts.find(
    (a) => a.kind === "step-output",
  );
  if (outputArtifact?.content !== undefined) {
    return ok({
      output: outputArtifact.content as T,
      usedArtifacts: [outputArtifact],
    });
  }

  // If no output artifact, we need to re-execute with artifact injection.
  // This requires the step function and a replay-aware context.
  // For pure replay without re-execution, return error if output is missing.
  return err({
    code: "MISSING_OUTPUT",
    message: `No step-output artifact found in snapshot for step "${snapshot.stepName}"`,
  });
}

/**
 * Create a replay context from a snapshot.
 * Use this when you need to manually control artifact retrieval.
 */
export function createReplayContext(
  snapshot: Snapshot,
  getArtifact: GetArtifact,
): ReplayContext {
  const artifacts = new Map<string, Artifact>();
  for (const artifact of snapshot.artifacts) {
    artifacts.set(artifact.hash, artifact);
  }
  return { getArtifact, artifacts };
}
