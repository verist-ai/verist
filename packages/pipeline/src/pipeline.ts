// SPDX-License-Identifier: Apache-2.0

import type { BaseAdapters, ContextFactory } from "@verist/core";
import { isBlockingCommand, isControlCommand, runStep } from "@verist/core";
import type {
  Pipeline,
  PipelineConfig,
  PipelineResult,
  StageResult,
} from "./types.ts";

/**
 * Parameters for running a pipeline.
 */
export interface RunPipelineParams<
  TAdapters extends BaseAdapters = BaseAdapters,
> {
  pipeline: Pipeline;
  input: unknown;
  contextFactory: ContextFactory<TAdapters>;
  workflowId: string;
  runId?: string;
}

/**
 * Define a pipeline from a sequence of steps.
 *
 * Pipelines execute stages sequentially, wiring the output of each stage
 * to the input of the next. All stages share the same runId.
 *
 * @example
 * const pipeline = definePipeline({
 *   name: "process-document",
 *   version: "1.0.0",
 *   stages: [
 *     { step: parseDocument },
 *     { step: extractClaims, wire: (prev) => ({ markdown: prev.markdown }) },
 *     { step: verifyClaims, wire: (prev) => ({ claims: prev.claims }) },
 *   ],
 * });
 */
export function definePipeline(config: PipelineConfig): Pipeline {
  return {
    name: config.name,
    version: config.version,
    stages: config.stages,
  };
}

/**
 * Execute a pipeline sequentially.
 *
 * - Calls steps in order, wiring data between stages
 * - Stops on error (unless onError: "continue"), suspend, or review
 * - Throws immediately if a stage returns control commands (invoke/fanout)
 * - Side-effect commands (emit) pass through
 *
 * @example
 * const result = await runPipeline({
 *   pipeline,
 *   input: { documentId: "doc-123" },
 *   contextFactory,
 *   workflowId: "doc-processing",
 *   runId: "run-abc",
 * });
 *
 * if (result.ok) {
 *   console.log(result.output);
 * } else if (result.suspendedAt) {
 *   console.log(`Suspended at ${result.suspendedAt}`);
 * } else {
 *   console.log(`Failed at ${result.error.stepName}: ${result.error.message}`);
 * }
 */
export async function runPipeline<
  TOutput,
  TAdapters extends BaseAdapters = BaseAdapters,
>(params: RunPipelineParams<TAdapters>): Promise<PipelineResult<TOutput>> {
  const { pipeline, input, contextFactory, workflowId } = params;
  const runId = params.runId ?? generateRunId();

  const stages: StageResult[] = [];
  let currentDelta: unknown = undefined;

  for (const stage of pipeline.stages) {
    const startTime = performance.now();

    // Wire: first stage gets pipeline input, others get previous delta
    const stageInput = stage.wire
      ? stage.wire(currentDelta, input)
      : (currentDelta ?? input);

    const result = await runStep({
      step: stage.step,
      input: stageInput,
      contextFactory,
      workflowId,
      workflowVersion: pipeline.version,
      runId,
    });

    const durationMs = performance.now() - startTime;

    if (!result.ok) {
      // Handle error based on policy
      if (stage.onError === "continue") {
        // Emit pipeline_stage_error audit event to maintain evidence trail
        const stageError = {
          type: "pipeline_stage_error",
          payload: {
            stepName: stage.step.name,
            code: result.error.code,
            message: result.error.message,
            continued: true,
          },
        };
        // Record what was actually forwarded (matches wire logic for next stage)
        const carryForward = currentDelta ?? input;
        stages.push({
          stepName: stage.step.name,
          status: "continued",
          delta: carryForward,
          events: [stageError],
          durationMs,
          error: {
            stepName: stage.step.name,
            code: result.error.code,
            message: result.error.message,
            cause: result.error.cause,
          },
        });
        continue;
      }

      const pipelineError = {
        stepName: stage.step.name,
        code: result.error.code,
        message: result.error.message,
        cause: result.error.cause,
      };

      stages.push({
        stepName: stage.step.name,
        status: "failed",
        events: [],
        durationMs,
        error: pipelineError,
      });

      return {
        ok: false,
        runId,
        stages,
        error: pipelineError,
      };
    }

    const output = result.value.output;
    const commands = output.commands ?? [];

    // Reject control commands (invoke/fanout not allowed in pipelines)
    const controlCmd = commands.find(isControlCommand);
    if (controlCmd) {
      throw new Error(
        `Control command "${controlCmd.type}" not allowed in pipeline stage "${stage.step.name}"`,
      );
    }

    // Stop on blocking commands (suspend/review)
    const blockingCmds = commands.filter(isBlockingCommand);
    if (blockingCmds.length > 1) {
      throw new Error(
        `Multiple blocking commands in pipeline stage "${stage.step.name}"`,
      );
    }

    const blockingCmd = blockingCmds[0];
    if (blockingCmd) {
      // suspend: discard sibling commands (context may change on resume)
      // review: keep sibling commands (they're deferred until review resolves)
      const stageCommands =
        blockingCmd.type === "suspend" ? [blockingCmd] : commands;

      stages.push({
        stepName: stage.step.name,
        status: "suspended",
        delta: output.delta,
        events: output.events,
        commands: stageCommands,
        durationMs,
        blockedBy: blockingCmd.type as "suspend" | "review",
      });

      return {
        ok: false,
        runId,
        stages,
        suspendedAt: stage.step.name,
      };
    }

    // Success – update current delta and continue
    currentDelta = output.delta;
    stages.push({
      stepName: stage.step.name,
      status: "completed",
      delta: currentDelta,
      events: output.events,
      commands: commands.length > 0 ? commands : undefined,
      durationMs,
    });
  }

  return {
    ok: true,
    runId,
    stages,
    output: currentDelta as TOutput,
  };
}

function generateRunId(): string {
  if (typeof crypto?.randomUUID !== "function") {
    throw new Error(
      "runPipeline() requires Web Crypto API (Node 20+, Bun, Deno, modern browsers). " +
        "Provide runId explicitly or upgrade your runtime.",
    );
  }
  return crypto.randomUUID();
}
