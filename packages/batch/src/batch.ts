// SPDX-License-Identifier: Apache-2.0

import type {
  BaseAdapters,
  ContextFactory,
  Step,
  StepError,
} from "@verist/core";
import { isBlockingCommand, runStep } from "@verist/core";
import type { BatchOptions, BatchResult, ItemResult } from "./types.ts";

/**
 * Parameters for batch execution.
 */
export interface RunBatchParams<
  TInput,
  TDelta,
  TAdapters extends BaseAdapters = BaseAdapters,
> {
  step: Step<TInput, TDelta, TAdapters>;
  items: TInput[];
  contextFactory: ContextFactory<TAdapters>;
  workflowId: string;
  workflowVersion: string;
  batchId?: string;
  options?: BatchOptions<TInput>;
}

const DELIMITER = "::";

/**
 * Execute a step for multiple items with concurrency control.
 *
 * Each item runs as an independent execution with its own runId.
 * Results are returned in input order regardless of completion order.
 *
 * @example
 * const result = await runBatch({
 *   step: processDocument,
 *   items: documents,
 *   contextFactory: createContextFactory({ db, llm }),
 *   workflowId: "process-batch",
 *   workflowVersion: "1.0.0",
 *   options: {
 *     concurrency: 5,
 *     failurePolicy: "continue",
 *     itemKey: (doc) => doc.id,
 *   },
 * });
 */
export async function runBatch<
  TInput,
  TDelta,
  TAdapters extends BaseAdapters = BaseAdapters,
>(
  params: RunBatchParams<TInput, TDelta, TAdapters>,
): Promise<BatchResult<TInput, TDelta, StepError>> {
  const {
    step,
    items,
    contextFactory,
    workflowId,
    workflowVersion,
    options = {},
  } = params;

  const concurrency = options.concurrency ?? 10;
  const failurePolicy = options.failurePolicy ?? "continue";
  const itemKeyFn = options.itemKey;

  const batchId = params.batchId ?? generateBatchId();

  // Single-pass: compute keys, validate uniqueness and delimiter restriction
  const itemMeta: Array<{
    index: number;
    key: string | undefined;
    runId: string;
    input: TInput;
  }> = [];
  const seenKeys = new Map<string, number>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const key = itemKeyFn?.(item, i);

    if (key !== undefined) {
      if (key.includes(DELIMITER)) {
        throw new Error(
          `itemKey "${key}" at index ${i} contains reserved delimiter "${DELIMITER}"`,
        );
      }
      const existing = seenKeys.get(key);
      if (existing !== undefined) {
        throw new Error(
          `Duplicate itemKey "${key}" at indices ${existing} and ${i}`,
        );
      }
      seenKeys.set(key, i);
    }

    const suffix = key ?? String(i);
    const runId = `${batchId}${DELIMITER}${suffix}`;
    itemMeta.push({ index: i, key, runId, input: item });
  }

  // Results array – filled in input order
  const results: ItemResult<TInput, TDelta, StepError>[] = new Array(
    items.length,
  );

  // Shared state for worker pool
  let nextIndex = 0;
  let aborted = false;

  // Worker function – claims items by incrementing shared index
  const worker = async (): Promise<void> => {
    while (!aborted) {
      const idx = nextIndex++;
      if (idx >= items.length) break;

      const meta = itemMeta[idx]!;
      const startTime = performance.now();

      // Check if already aborted before starting
      if (aborted) {
        results[idx] = {
          index: meta.index,
          itemKey: meta.key,
          runId: meta.runId,
          input: meta.input,
          status: "skipped",
          durationMs: 0,
        };
        continue;
      }

      const stepResult = await runStep({
        step,
        input: meta.input,
        contextFactory,
        workflowId,
        workflowVersion,
        runId: meta.runId,
      });

      const durationMs = performance.now() - startTime;

      if (stepResult.ok) {
        const output = stepResult.value.output;

        // Check for barrier commands (review or suspend)
        const hasBarrier = output.commands?.some(isBlockingCommand);

        if (hasBarrier) {
          results[idx] = {
            index: meta.index,
            itemKey: meta.key,
            runId: meta.runId,
            input: meta.input,
            status: "blocked",
            delta: output.delta as TDelta,
            events: output.events,
            commands: output.commands,
            durationMs,
          };
        } else {
          results[idx] = {
            index: meta.index,
            itemKey: meta.key,
            runId: meta.runId,
            input: meta.input,
            status: "succeeded",
            delta: output.delta as TDelta,
            events: output.events,
            commands: output.commands,
            durationMs,
          };
        }
      } else {
        results[idx] = {
          index: meta.index,
          itemKey: meta.key,
          runId: meta.runId,
          input: meta.input,
          status: "failed",
          error: stepResult.error,
          durationMs,
        };

        // Abort stops scheduling new items; in-flight complete
        if (failurePolicy === "abort") {
          aborted = true;
        }
      }
    }
  };

  // Mark remaining items as skipped after workers finish
  const markSkipped = (): void => {
    for (let i = 0; i < items.length; i++) {
      if (results[i] === undefined) {
        const meta = itemMeta[i]!;
        results[i] = {
          index: meta.index,
          itemKey: meta.key,
          runId: meta.runId,
          input: meta.input,
          status: "skipped",
          durationMs: 0,
        };
      }
    }
  };

  // Launch workers
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  // Mark any unprocessed items as skipped (if aborted)
  markSkipped();

  // Compute summary counts
  const counts = { succeeded: 0, failed: 0, blocked: 0, skipped: 0 };
  for (const r of results) {
    counts[r.status]++;
  }

  return {
    batchId,
    total: items.length,
    succeeded: counts.succeeded,
    failed: counts.failed,
    blocked: counts.blocked,
    skipped: counts.skipped,
    aborted,
    results,
  };
}

function generateBatchId(): string {
  if (typeof crypto?.randomUUID !== "function") {
    throw new Error(
      "runBatch() requires Web Crypto API (Node 19+, Bun, Deno, modern browsers). " +
        "Provide batchId explicitly or upgrade your runtime.",
    );
  }
  return crypto.randomUUID();
}
