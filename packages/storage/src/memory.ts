// SPDX-License-Identifier: Apache-2.0

import { err, ok } from "verist";
import type {
  CommitParams,
  RunState,
  RunStore,
  StorageError,
} from "./index.ts";

/**
 * Create an in-memory RunStore for examples and tests.
 *
 * - No persistence, no outbox, no blocks; events/commands are accepted but not stored
 * - Optimistic locking via expectedVersion
 * - Shallow merge for both commit output and setOverlay
 */
export function createMemoryStore(): RunStore {
  const store = new Map<string, RunState>();

  function key(workflowId: string, runId: string): string {
    return `${workflowId}\0${runId}`;
  }

  return {
    async load<T extends object = Record<string, unknown>>(
      workflowId: string,
      runId: string,
    ) {
      const snapshot = store.get(key(workflowId, runId));
      if (!snapshot) {
        return err({
          code: "not_found",
          message: `Run ${runId} not found in workflow ${workflowId}`,
        } as StorageError);
      }
      // Return a clone to prevent external mutation
      return ok(structuredClone(snapshot) as RunState<T>);
    },

    async commit<T extends object>(params: CommitParams<T>) {
      const { workflowId, runId, expectedVersion, output } = params;
      const k = key(workflowId, runId);
      const existing = store.get(k);

      if (expectedVersion === 0) {
        // Creating new run
        if (existing) {
          return err({
            code: "conflict",
            message: `Run ${runId} already exists`,
            reason: "run_exists",
          } as StorageError);
        }
        const now = new Date();
        const snapshot: RunState<T> = {
          workflowId,
          runId,
          version: 1,
          computed: { ...output } as T,
          overlay: {},
          createdAt: now,
          updatedAt: now,
        };
        store.set(k, snapshot as RunState);
        return ok(structuredClone(snapshot));
      }

      // Updating existing run
      if (!existing) {
        return err({
          code: "not_found",
          message: `Run ${runId} not found`,
        } as StorageError);
      }
      if (existing.version !== expectedVersion) {
        return err({
          code: "conflict",
          message: `Version mismatch: expected ${expectedVersion}, got ${existing.version}`,
          reason: "version_mismatch",
        } as StorageError);
      }

      const snapshot: RunState<T> = {
        workflowId,
        runId,
        version: existing.version + 1,
        computed: Object.assign({}, existing.computed, output) as T,
        overlay: { ...existing.overlay } as Partial<T>,
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      };
      store.set(k, snapshot as RunState);
      return ok(structuredClone(snapshot));
    },

    async setOverlay<T extends object>(
      workflowId: string,
      runId: string,
      overlay: Partial<T>,
    ) {
      const k = key(workflowId, runId);
      const existing = store.get(k);
      if (!existing) {
        return err({
          code: "not_found",
          message: `Run ${runId} not found`,
        } as StorageError);
      }

      // Strip undefined values — they would silently null-out computed fields
      // via spread in effectiveState. Overlay supports set/overwrite, not delete.
      const clean: Record<string, unknown> = {};
      for (const [k2, v] of Object.entries(
        overlay as Record<string, unknown>,
      )) {
        if (v !== undefined) clean[k2] = v;
      }

      const snapshot: RunState<T> = {
        ...existing,
        overlay: { ...existing.overlay, ...clean } as Partial<T>,
        updatedAt: new Date(),
      } as RunState<T>;
      store.set(k, snapshot as RunState);
      return ok(structuredClone(snapshot));
    },
  };
}
