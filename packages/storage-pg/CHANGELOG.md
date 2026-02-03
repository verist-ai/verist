# @verist/storage-pg

## 0.0.7

### Patch Changes

- Updated dependencies [ab51d5f]
  - @verist/replay@0.0.9

## 0.0.6

### Patch Changes

- Updated dependencies [dbed3be]
  - @verist/storage@0.0.4

## 0.0.5

### Patch Changes

- Updated dependencies [f6b283f]
  - @verist/replay@0.0.8

## 0.0.4

### Patch Changes

- b5814f0: Bump drizzle-orm peer dependency to ^0.45.1
- Updated dependencies [b5814f0]
  - @verist/replay@0.0.7

## 0.0.3

### Patch Changes

- 46237f6: Add queue adapter implementation and storage outbox/block primitives for reliable execution loops.
  - Implement `createBullMQ()` in `@verist/queue` with deduplicated enqueue, handler processing, and graceful shutdown.
  - Extend `@verist/storage` contracts with optional atomic `commands` on commit and typed conflict `reason` values.
  - Extend `@verist/storage-pg` with outbox + blocking state support (`verist_outbox`, `verist_blocks`, lease/dispatch APIs, block resolution APIs).

  **BREAKING (for adapter implementers and queue callers):**
  - `@verist/queue` `QueueAdapter.process()` signature is now `process(handler)` (removed `workflowId` and `stepId` parameters).
  - `@verist/queue` `enqueue()` now accepts optional `EnqueueOptions`.
  - `@verist/queue` `BullMQConfig` changed from `redisUrl` to `connection` + `queueName`.
  - `@verist/storage` `CommitParams` now includes optional `commands`.
  - `@verist/storage` `StorageError` may include `reason` for `conflict` results (and adapters should set it).

- Updated dependencies [98a4883]
- Updated dependencies [119e0b0]
- Updated dependencies [46237f6]
- Updated dependencies [98a4883]
  - @verist/core@0.0.6
  - @verist/storage@0.0.3
  - @verist/replay@0.0.6
