// SPDX-License-Identifier: Apache-2.0

import type { Artifact, ArtifactKind } from "./artifact.ts";
import { hashValue, stableStringify } from "./artifact.ts";
import type { Command } from "./command.ts";
import type { StepResult } from "./run.ts";
import type {
  CaptureOptions,
  CreateSnapshotParams,
  Snapshot,
} from "./types.ts";

/**
 * Artifact kinds owned by the kernel. Only `createSnapshotFromResult`
 * may produce these — user code and adapters must not emit them.
 */
export const RESERVED_ARTIFACT_KINDS: ReadonlySet<ArtifactKind> = new Set([
  "step-output",
  "step-commands",
]);

/**
 * Capture a value as an artifact with its content hash.
 *
 * @example
 * ```typescript
 * const artifact = await captureArtifact("llm-output", response);
 * // => { hash: "sha256:...", kind: "llm-output", content: response }
 *
 * // Compliance mode: hash only, no content stored
 * const hashOnly = await captureArtifact("llm-output", response, { hashOnly: true });
 * // => { hash: "sha256:...", kind: "llm-output" }
 * ```
 */
export async function captureArtifact(
  kind: Artifact["kind"],
  content: unknown,
  options?: CaptureOptions,
): Promise<Artifact> {
  const hash = await hashValue(content);

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
 * const snapshot = await createSnapshot({
 *   workflowId: "verify-doc",
 *   workflowVersion: "1.0.0",
 *   stepName: "extract",
 *   input: { documentId: "doc-123" },
 *   artifacts: [await captureArtifact("llm-output", response)],
 * });
 * ```
 */
export async function createSnapshot(
  params: CreateSnapshotParams,
): Promise<Snapshot> {
  return {
    workflowId: params.workflowId,
    workflowVersion: params.workflowVersion,
    stepName: params.stepName,
    input: params.input,
    inputHash: await hashValue(params.input),
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
  /** Set to false to suppress command capture. Commands are auto-captured when present. */
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
 * Returns semantic projections (not full Command objects) sorted by type,
 * then by identifying field, then by serialized content.
 *
 * Runtime metadata added by runners is stripped — only fields that define
 * the command's meaning are retained. This ensures stable hashes and diffs
 * across different runners and execution attempts.
 */
export function normalizeCommands(commands: Command[] | undefined): unknown[] {
  if (!commands || commands.length === 0) return [];

  return [...commands]
    .sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);

      // Use stable identity keys where available (step name, topic).
      // review/suspend have no structural identity key — fall through to full hash.
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
      }

      if (identifierCmp !== 0) return identifierCmp;

      return stableStringify(commandSemanticFields(a)).localeCompare(
        stableStringify(commandSemanticFields(b)),
      );
    })
    .map(commandSemanticFields);
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
 *   const snapshot = await createSnapshotFromResult(result.value);
 *   await artifactStore.save(snapshot);
 * }
 * ```
 */
export async function createSnapshotFromResult<TInput, TDelta>(
  result: StepResult<TInput, TDelta>,
  options?: SnapshotFromResultOptions,
): Promise<Snapshot> {
  // Normalize optional fields so hash is stable regardless of how StepResult was constructed
  const normalizedOutput = {
    delta: result.output.delta,
    events: result.output.events ?? [],
    commands: result.output.commands,
  };

  const outputArtifact = await captureArtifact(
    "step-output",
    normalizedOutput,
    { hashOnly: options?.outputHashOnly },
  );

  // step-output: exact validated output for replay
  // step-commands: normalized semantic projection for stable hash/diff
  const artifacts: Artifact[] = [outputArtifact];

  // Auto-capture commands when present (opt out with captureCommands: false)
  const hasCommands = (normalizedOutput.commands?.length ?? 0) > 0;
  if (hasCommands && options?.captureCommands !== false) {
    const normalizedCommands = normalizeCommands(normalizedOutput.commands);
    const commandsArtifact = await captureArtifact(
      "step-commands",
      normalizedCommands,
      {
        hashOnly: options?.commandsHashOnly,
      },
    );
    artifacts.push(commandsArtifact);
  }

  // Guard: reject user-supplied artifacts with reserved kinds
  for (const a of options?.artifacts ?? []) {
    if (RESERVED_ARTIFACT_KINDS.has(a.kind)) {
      throw new Error(
        `Artifact kind "${a.kind}" is reserved by the kernel. ` +
          `Use a domain-specific kind (e.g. "llm-response", "pdf-source").`,
      );
    }
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
