// SPDX-License-Identifier: Apache-2.0

import { err, ok } from "@verist/core";
import type {
  CommitParams,
  RunStore,
  StateSnapshot,
  StorageError,
} from "./index.ts";

/**
 * Create an in-memory RunStore for examples and tests.
 *
 * - No persistence, no outbox, no blocks; events/commands are accepted but not stored
 * - Optimistic locking via expectedVersion
 * - Shallow merge for both commit delta and setOverlay
 */
export function createMemoryStore(): RunStore {
  const store = new Map<string, StateSnapshot>();

  function key(workflowId: string, runId: string): string {
    return `${workflowId}\0${runId}`;
  }

  return {
    async load(workflowId, runId) {
      const snapshot = store.get(key(workflowId, runId));
      if (!snapshot) return ok(null);
      // Return a clone to prevent external mutation
      return ok(structuredClone(snapshot));
    },

    async commit<T>(params: CommitParams<T>) {
      const { workflowId, runId, expectedVersion, delta } = params;
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
        const snapshot: StateSnapshot<T> = {
          workflowId,
          runId,
          version: 1,
          computed: { ...delta } as T,
          overlay: {},
          createdAt: now,
          updatedAt: now,
        };
        store.set(k, snapshot as StateSnapshot);
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

      const snapshot: StateSnapshot<T> = {
        workflowId,
        runId,
        version: existing.version + 1,
        computed: Object.assign({}, existing.computed, delta) as T,
        overlay: { ...existing.overlay } as Partial<T>,
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      };
      store.set(k, snapshot as StateSnapshot);
      return ok(structuredClone(snapshot));
    },

    async setOverlay<T>(
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

      const snapshot: StateSnapshot<T> = {
        ...existing,
        overlay: { ...existing.overlay, ...clean } as Partial<T>,
        updatedAt: new Date(),
      } as StateSnapshot<T>;
      store.set(k, snapshot as StateSnapshot);
      return ok(structuredClone(snapshot));
    },
  };
}
