// SPDX-License-Identifier: Apache-2.0

import type { OnArtifact } from "./artifact.ts";
import type { AuditEvent } from "./event.ts";
import type { BaseAdapters } from "./types.ts";

/**
 * Execution metadata passed to context factory.
 */
export interface ExecutionMetadata {
  workflowId: string;
  workflowVersion: string;
  runId: string;
  /** Optional callback for capturing artifacts during execution. */
  onArtifact?: OnArtifact;
  /** Optional callback for emitting audit events from adapters (e.g., extract auto-emit). */
  emitEvent?: (event: AuditEvent) => void;
}

/**
 * Context passed to step run functions.
 * Contains adapters for external services (db, llm, etc.)
 * and execution metadata (workflow/run IDs, version).
 */
export interface StepContext<TAdapters extends BaseAdapters = BaseAdapters> {
  adapters: TAdapters;
  workflowId: string;
  workflowVersion: string;
  runId: string;
  /** Optional callback for capturing artifacts. Adapters use this to emit llm-input, llm-output, etc. */
  onArtifact?: OnArtifact;
  /** Callback for emitting audit events from adapters (e.g., extract auto-emit). */
  emitEvent: (event: AuditEvent) => void;
}

/**
 * Factory function that creates step context.
 * Called once per step execution.
 */
export type ContextFactory<TAdapters extends BaseAdapters = BaseAdapters> = (
  params: ExecutionMetadata,
) => StepContext<TAdapters>;

/**
 * Create a context factory from a fixed set of adapters.
 * The factory attaches execution metadata at runtime.
 */
export function createContextFactory<TAdapters extends BaseAdapters>(
  adapters: TAdapters,
): ContextFactory<TAdapters> {
  return ({ workflowId, workflowVersion, runId, onArtifact, emitEvent }) => ({
    adapters,
    workflowId,
    workflowVersion,
    runId,
    onArtifact,
    emitEvent: emitEvent ?? (() => {}),
  });
}
