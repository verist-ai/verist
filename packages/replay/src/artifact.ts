import type { Command, StepResult } from "@verist/core";
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
  /** If true, capture commands as step-commands artifact. Required for command diffing. */
  captureCommands?: boolean;
  /** If true, omit content from step-commands artifact (hash only). */
  commandsHashOnly?: boolean;
  /** Additional artifacts to include (e.g., LLM responses captured during execution) */
  artifacts?: Artifact[];
}

/**
 * Extract semantic fields from a command for hashing.
 * Excludes any runtime metadata that may be added by runners.
 */
function commandSemanticFields(cmd: Command): unknown {
  switch (cmd.type) {
    case "invoke":
      return { type: cmd.type, step: cmd.step, input: cmd.input };
    case "fanout":
      return { type: cmd.type, step: cmd.step, inputs: cmd.inputs };
    case "emit":
      return { type: cmd.type, topic: cmd.topic, payload: cmd.payload };
    case "review":
      return { type: cmd.type, reason: cmd.reason, payload: cmd.payload };
    case "suspend":
      return {
        type: cmd.type,
        reason: cmd.reason,
        checkpoint: cmd.checkpoint,
        resumeStep: cmd.resumeStep,
      };
  }
}

/**
 * Normalize commands for consistent hashing and comparison.
 * Commands are sorted by type, then by identifying field, then by semantic content hash.
 * This ensures semantically identical command sets produce identical hashes.
 *
 * Only semantic fields are considered — runtime metadata added by runners is ignored.
 */
export function normalizeCommands(commands: Command[] | undefined): Command[] {
  if (!commands || commands.length === 0) return [];

  return [...commands].sort((a, b) => {
    // Sort by type first
    if (a.type !== b.type) return a.type.localeCompare(b.type);

    // Within same type, sort by identifying field
    let identifierCmp = 0;
    switch (a.type) {
      case "invoke":
      case "fanout":
        identifierCmp = (a as { step: string }).step.localeCompare(
          (b as { step: string }).step,
        );
        break;
      case "emit":
        identifierCmp = (a as { topic: string }).topic.localeCompare(
          (b as { topic: string }).topic,
        );
        break;
      case "review":
      case "suspend":
        identifierCmp = (a as { reason: string }).reason.localeCompare(
          (b as { reason: string }).reason,
        );
        break;
    }

    if (identifierCmp !== 0) return identifierCmp;

    // Tie-breaker: hash of semantic fields only (ignores runtime metadata)
    return hashValue(commandSemanticFields(a)).localeCompare(
      hashValue(commandSemanticFields(b)),
    );
  });
}

/**
 * Create a canonical snapshot from a step execution result.
 *
 * This is the preferred way to create snapshots for replay. It ensures
 * correct field mapping and includes the step output as an artifact.
 *
 * **Compliance note:** `outputHashOnly` and `commandsHashOnly` apply only
 * to artifacts created by this helper. The `input` field is always stored
 * in full (it's part of the Snapshot structure). Any additional
 * `options.artifacts` retain their original form — use
 * `captureArtifact(..., { hashOnly: true })` when creating them if content
 * must be omitted.
 *
 * @example
 * ```typescript
 * const result = await runStep({ step, input, ... });
 * if (result.ok) {
 *   // Capture output and commands for full diff support
 *   const snapshot = createSnapshotFromResult(result.value, {
 *     captureCommands: true,
 *   });
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

  const artifacts: Artifact[] = [outputArtifact];

  // Capture commands if requested (required for command diffing)
  if (options?.captureCommands) {
    const normalizedCommands = normalizeCommands(result.output.commands);
    const commandsArtifact = captureArtifact(
      "step-commands",
      normalizedCommands,
      {
        hashOnly: options?.commandsHashOnly,
      },
    );
    artifacts.push(commandsArtifact);
  }

  artifacts.push(...(options?.artifacts ?? []));

  return createSnapshot({
    workflowId: result.workflowId,
    workflowVersion: result.workflowVersion,
    stepName: result.stepName,
    input: result.input,
    artifacts,
  });
}
