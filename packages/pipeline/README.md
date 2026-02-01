# @verist/pipeline

[![npm version](https://badge.fury.io/js/@verist%2Fpipeline.svg)](https://badge.fury.io/js/@verist%2Fpipeline)
[![npm downloads](https://img.shields.io/npm/dm/@verist/pipeline.svg)](https://npmjs.com/package/@verist/pipeline)
[![Ask ChatGPT](https://img.shields.io/badge/Ask_ChatGPT-10a37f?logo=google+gemini&logoColor=white)](https://chatgpt.com/g/g-697e23b923088191b8cb315bebf14a3b-verist-architect)
[![Twitter Follow](https://img.shields.io/twitter/follow/verist_ai?style=social)](https://x.com/verist_ai)

Sequential pipeline composition for Verist workflow steps.

## Installation

```bash
bun add @verist/pipeline @verist/core
```

## Usage

```ts
import { z } from "zod";
import { defineStep, createContextFactory } from "@verist/core";
import { definePipeline, runPipeline } from "@verist/pipeline";

const parse = defineStep({
  name: "parse",
  input: z.object({ text: z.string() }),
  delta: z.object({ markdown: z.string() }),
  run: async (input) => ({
    delta: { markdown: input.text },
    events: [{ type: "parsed" }],
  }),
});

const extract = defineStep({
  name: "extract",
  input: z.object({ markdown: z.string() }),
  delta: z.object({ claims: z.array(z.string()) }),
  run: async (input) => ({
    delta: { claims: [input.markdown] },
    events: [{ type: "extracted" }],
  }),
});

const pipeline = definePipeline({
  name: "process-document",
  workflowVersion: "1.0.0",
  stages: [
    { step: parse },
    { step: extract, wire: (prev) => ({ markdown: prev.markdown }) },
  ],
});

const result = await runPipeline({
  pipeline,
  input: { text: "Hello" },
  contextFactory: createContextFactory({}),
  workflowId: "doc-processing",
});

if (result.ok) {
  console.log(result.output);
} else if (result.suspendedAt) {
  console.log(`Suspended at ${result.suspendedAt}`);
} else {
  console.log(`Failed at ${result.error.stepName}`);
}
```

## Stage Options

```ts
interface PipelineStageConfig {
  step: Step<any, any, any>;
  wire?: (prevDelta: unknown, pipelineInput: unknown) => unknown;
  onError?: "fail" | "continue"; // default "fail"
}
```

## Behavior

- Stages execute sequentially and share the same `runId`.
- If `runId` is omitted, it defaults to `crypto.randomUUID()` (Node 20+, Bun, Deno, browsers).
- Control commands (`invoke`, `fanout`) are not allowed and throw immediately.
- Blocking commands (`suspend`, `review`) stop the pipeline and set `suspendedAt`. At most one blocking command per stage.
- `onError: "continue"` acknowledges the error and proceeds. The pipeline emits a `pipeline.stage_error` audit event to maintain the evidence trail. The previous delta is carried forward, and the error is recorded in `StageResult.error`.

## Result Shape

```ts
interface PipelineResult<TOutput = unknown> {
  ok: boolean;
  runId: string;
  stages: StageResult[];
  output?: TOutput;
  error?: PipelineError;
  suspendedAt?: string;
}
```

## License

[Apache-2.0](../../LICENSE)
