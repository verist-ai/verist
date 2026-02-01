// SPDX-License-Identifier: Apache-2.0

import type { AuditEvent, Command, StepError } from "@verist/core";

/**
 * Options for batch execution.
 */
export interface BatchOptions<TItem> {
  /** Maximum concurrent executions. Default: 10 */
  concurrency?: number;
  /** How to handle failures. Default: "continue" */
  failurePolicy?: "continue" | "abort";
  /**
   * Extract a unique key from each item. Used in runId: `${batchId}::${itemKey}`.
   * Keys must not contain "::" to keep prefix queries unambiguous.
   */
  itemKey?: (item: TItem, index: number) => string | undefined;
}

/**
 * Result of a batch execution.
 */
export interface BatchResult<TInput, TDelta, TError = StepError> {
  batchId: string;
  total: number;
  succeeded: number;
  failed: number;
  blocked: number;
  skipped: number;
  /** True if batch was aborted due to failure policy */
  aborted: boolean;
  results: ItemResult<TInput, TDelta, TError>[];
}

/**
 * Status of an individual item execution.
 *
 * - succeeded: Step completed without barriers
 * - failed: Step threw or validation failed
 * - blocked: Step returned a barrier command (review or suspend)
 * - skipped: Batch aborted before this item was processed
 */
export type ItemStatus = "succeeded" | "failed" | "blocked" | "skipped";

/**
 * Result of a single item execution within a batch.
 */
export interface ItemResult<TInput, TDelta, TError = StepError> {
  index: number;
  itemKey?: string;
  runId: string;
  input: TInput;
  status: ItemStatus;
  delta?: TDelta;
  events?: AuditEvent[];
  commands?: Command[];
  error?: TError;
  durationMs: number;
  /** Present when status is "blocked" — indicates which command blocked the item. */
  blockedBy?: "review" | "suspend";
}
