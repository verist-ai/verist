// SPDX-License-Identifier: Apache-2.0

import type {
  BaseAdapters,
  OptionsArg,
  Result,
  Step,
  StepResult,
} from "@verist/core";
import type { SnapshotFromResultOptions } from "./artifact.ts";
import { createSnapshotFromResult } from "./artifact.ts";
import { formatDiff } from "./diff.ts";
import type { RecomputeError, RecomputeOptions } from "./recompute.ts";
import { recompute as recomputeFull } from "./recompute.ts";
import type { DiffResult, RecomputeResult, Snapshot } from "./types.ts";

export async function capture<TInput, TDelta>(
  result: StepResult<TInput, TDelta>,
  options?: SnapshotFromResultOptions,
): Promise<Snapshot> {
  return createSnapshotFromResult(result, options);
}

export async function recompute<
  TInput,
  TDelta,
  TAdapters extends BaseAdapters = BaseAdapters,
>(
  snapshot: Snapshot,
  step: Step<TInput, TDelta, TAdapters>,
  ...args: OptionsArg<TAdapters, RecomputeOptions<TAdapters>>
): Promise<Result<RecomputeResult<TDelta>, RecomputeError>> {
  return recomputeFull(snapshot, step, ...args);
}

export function diff(result: DiffResult | undefined): string {
  if (!result || result.equal) return "No changes.";
  return formatDiff(result);
}
