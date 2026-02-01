# @verist/batch

[![npm version](https://badge.fury.io/js/@verist%2Fbatch.svg)](https://badge.fury.io/js/@verist%2Fbatch)
[![npm downloads](https://img.shields.io/npm/dm/@verist/batch.svg)](https://npmjs.com/package/@verist/batch)
[![Ask ChatGPT](https://img.shields.io/badge/Ask_ChatGPT-10a37f?logo=google+gemini&logoColor=white)](https://chatgpt.com/g/g-697e23b923088191b8cb315bebf14a3b-verist-architect)
[![Twitter Follow](https://img.shields.io/twitter/follow/verist_ai?style=social)](https://x.com/verist_ai)

Batch execution for Verist workflow steps with concurrency control and stable run IDs.

## Installation

```bash
bun add @verist/batch @verist/core
```

## Usage

```ts
import { z } from "zod";
import { defineStep, createContextFactory } from "@verist/core";
import { runBatch } from "@verist/batch";

const processItem = defineStep({
  name: "processItem",
  input: z.object({ id: z.string(), value: z.number() }),
  delta: z.object({ doubled: z.number() }),
  run: async (input) => ({
    delta: { doubled: input.value * 2 },
    events: [{ type: "item_processed", payload: { id: input.id } }],
  }),
});

const items = [
  { id: "a", value: 1 },
  { id: "b", value: 2 },
  { id: "c", value: 3 },
];

const result = await runBatch({
  step: processItem,
  items,
  contextFactory: createContextFactory({}),
  workflowId: "process-batch",
  workflowVersion: "1.0.0",
  options: {
    concurrency: 5,
    failurePolicy: "continue",
    itemKey: (item) => item.id,
  },
});

console.log(result.succeeded); // 3
console.log(result.results[0]?.runId); // <batchId>::a
```

## Options

```ts
interface BatchOptions<TItem> {
  concurrency?: number; // default 10
  failurePolicy?: "continue" | "abort"; // default "continue"
  itemKey?: (item: TItem, index: number) => string | undefined;
}
```

## Behavior

- Each item runs as a separate `runStep` with a unique `runId`.
- `runId` format: `${batchId}::${itemKey | index}` ("::" is reserved).
- If `batchId` is omitted, it defaults to `crypto.randomUUID()` (Node 19+, Bun, Deno, browsers).
- Results preserve input order regardless of completion order.
- Items that return `review` or `suspend` commands are marked `blocked`.
- With `failurePolicy: "abort"`, new items stop scheduling after the first failure; in-flight items finish and remaining items are marked `skipped`.

## Result Shape

```ts
interface BatchResult<TInput, TDelta, TError = StepError> {
  batchId: string;
  total: number;
  succeeded: number;
  failed: number;
  blocked: number;
  skipped: number;
  aborted: boolean;
  results: ItemResult<TInput, TDelta, TError>[];
}
```

## Design

Batch is a runner-level helper, not a kernel primitive. It reports execution outcomes without imposing policy (no retries, no thresholds). Blocked items (from `review` or `suspend` commands) can be queried by `runId`.

See [SPEC-batch](../../docs/specs/batch.md) for detailed semantics.

## License

[Apache-2.0](../../LICENSE)
