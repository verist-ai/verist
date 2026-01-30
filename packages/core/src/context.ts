import type { BaseAdapters } from "./types.ts";

/**
 * Execution metadata passed to context factory.
 */
export interface ExecutionMetadata {
  workflowId: string;
  workflowVersion: string;
  runId: string;
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
  return ({ workflowId, workflowVersion, runId }) => ({
    adapters,
    workflowId,
    workflowVersion,
    runId,
  });
}
