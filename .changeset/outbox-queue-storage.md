---
"@verist/queue": patch
"@verist/storage": patch
"@verist/storage-pg": patch
---

Add queue adapter implementation and storage outbox/block primitives for reliable execution loops.

- Implement `createBullMQ()` in `@verist/queue` with deduplicated enqueue, handler processing, and graceful shutdown.
- Extend `@verist/storage` contracts with optional atomic `commands` on commit and typed conflict `reason` values.
- Extend `@verist/storage-pg` with outbox + blocking state support (`verist_outbox`, `verist_blocks`, lease/dispatch APIs, block resolution APIs).

**BREAKING (for adapter implementers and queue callers):**

- `@verist/queue` `QueueAdapter.process()` signature is now `process(handler)` (removed `workflowId` and `stepId` parameters).
- `@verist/queue` `enqueue()` now accepts optional `EnqueueOptions`.
- `@verist/queue` `BullMQConfig` changed from `redisUrl` to `connection` + `queueName`.
- `@verist/storage` `CommitParams` now includes optional `commands`.
- `@verist/storage` `StorageError` may include `reason` for `conflict` results (and adapters should set it).
