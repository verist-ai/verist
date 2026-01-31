import type { StepResult } from "@verist/core";
import { hashValue } from "./hash.ts";
import type {
  Artifact,
  CaptureOptions,
  CreateSnapshotParams,
  Snapshot,
} from "./types.ts";

/**
 * Capture a value as an artifact with its content hash.
 *
 * @example
 * ```typescript
 * const artifact = captureArtifact("llm-output", response);
 * // => { hash: "sha256:...", kind: "llm-output", content: response }
 *
 * // Compliance mode: hash only, no content stored
 * const hashOnly = captureArtifact("llm-output", response, { hashOnly: true });
 * // => { hash: "sha256:...", kind: "llm-output" }
 * ```
 */
export function captureArtifact(
  kind: Artifact["kind"],
  content: unknown,
  options?: CaptureOptions,
): Artifact {
  const hash = hashValue(content);

  if (options?.hashOnly) {
    return { hash, kind };
  }

  return { hash, kind, content };
}

/**
 * Create a snapshot capturing step execution state.
 *
 * @example
 * ```typescript
 * const snapshot = createSnapshot({
 *   workflowId: "verify-doc",
 *   workflowVersion: "1.0.0",
 *   stepName: "extract",
 *   input: { documentId: "doc-123" },
 *   artifacts: [captureArtifact("llm-output", response)],
 * });
 * ```
 */
export function createSnapshot(params: CreateSnapshotParams): Snapshot {
  return {
    workflowId: params.workflowId,
    workflowVersion: params.workflowVersion,
    stepName: params.stepName,
    input: params.input,
    inputHash: hashValue(params.input),
    artifacts: params.artifacts,
    capturedAt: Date.now(),
  };
}

/**
 * Options for creating a snapshot from a step result.
 */
export interface SnapshotFromResultOptions {
  /** If true, omit content from step-output artifact (hash only). Input is always stored in full. */
  outputHashOnly?: boolean;
  /** Additional artifacts to include (e.g., LLM responses captured during execution) */
  artifacts?: Artifact[];
}

/**
 * Create a canonical snapshot from a step execution result.
 *
 * This is the preferred way to create snapshots for replay. It ensures
 * correct field mapping and includes the step output as an artifact.
 *
 * **Compliance note:** `outputHashOnly` applies only to the step-output
 * artifact created by this helper. The `input` field is always stored in full
 * (it's part of the Snapshot structure). Any additional `options.artifacts`
 * retain their original form — use `captureArtifact(..., { hashOnly: true })`
 * when creating them if content must be omitted.
 *
 * @example
 * ```typescript
 * const result = await runStep({ step, input, ... });
 * if (result.ok) {
 *   const snapshot = createSnapshotFromResult(result.value);
 *   await artifactStore.save(snapshot);
 * }
 * ```
 */
export function createSnapshotFromResult<TInput, TDelta>(
  result: StepResult<TInput, TDelta>,
  options?: SnapshotFromResultOptions,
): Snapshot {
  const outputArtifact = captureArtifact("step-output", result.output, {
    hashOnly: options?.outputHashOnly,
  });

  return createSnapshot({
    workflowId: result.workflowId,
    workflowVersion: result.workflowVersion,
    stepName: result.stepName,
    input: result.input,
    artifacts: [outputArtifact, ...(options?.artifacts ?? [])],
  });
}
