# @verist/storage

## 0.0.5

### Patch Changes

- 3a00052: Add generic type parameter to `RunStore.load<T>()`

  `load<T>()` now accepts a type parameter like `commit<T>()` and `setOverlay<T>()`, returning `StateSnapshot<T>` instead of `StateSnapshot<unknown>`. Eliminates manual casts at call sites.

  ```ts
  const snap = await store.load<MyState>(workflowId, runId);
  snap.value!.computed.score; // typed
  ```

## 0.0.4

### Patch Changes

- dbed3be: Add `createMemoryStore()` — in-memory `RunStore` for examples and tests

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
  - @verist/core@0.0.6
