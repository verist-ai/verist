# @verist/queue

[![npm version](https://badge.fury.io/js/@verist%2Fqueue.svg)](https://badge.fury.io/js/@verist%2Fqueue)
[![npm downloads](https://img.shields.io/npm/dm/@verist/queue.svg)](https://npmjs.com/package/@verist/queue)

Queue adapter interface and BullMQ implementation for Verist runners.

## Installation

```bash
bun add @verist/queue bullmq ioredis
```

## Job Model

Jobs are pointers, not payloads. Keep state in storage; queue only identifies what to run next.

```ts
interface Job {
  id: string; // dedupe key
  workflowId: string;
  workflowVersion: string;
  runId: string;
  stepId: string;
  priority?: number;
  delay?: number;
}
```

## Quick Start

```ts
import { createBullMQ } from "@verist/queue";

const queue = createBullMQ({
  connection: "redis://localhost:6379",
  queueName: "verist-jobs",
});

await queue.enqueue({
  id: "wf:verify:run-123:extract:v1",
  workflowId: "verify-document",
  workflowVersion: "1.0.0",
  runId: "run-123",
  stepId: "extract",
});

const stop = await queue.process(async (job) => {
  // Load input from storage using workflowId/runId/stepId and execute step
  console.log(job.stepId, job.runId);
});

await stop();
await queue.close();
```

## Behavior Notes

- Duplicate enqueue with the same `job.id` is treated as success (idempotent dedupe)
- `process()` returns an async cleanup function
- BullMQ is loaded dynamically so adapters remain optional until used

## License

[Apache-2.0](../../LICENSE)
