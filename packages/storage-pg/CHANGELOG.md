# @verist/storage-pg

## 0.1.0

### Minor Changes

- 130c13c: First stable API release

### Patch Changes

- Updated dependencies [130c13c]
  - verist@0.1.0
  - @verist/storage@0.1.0

## 0.0.19

### Patch Changes

- 0805a31: Ship pre-built .d.ts declarations instead of serving types from source
- Updated dependencies [0805a31]
  - verist@0.0.7
  - @verist/storage@0.0.14

## 0.0.18

### Patch Changes

- Updated dependencies [5bd9b52]
  - verist@0.0.6
  - @verist/storage@0.0.13

## 0.0.17

### Patch Changes

- Updated dependencies [0d73f49]
  - verist@0.0.5
  - @verist/storage@0.0.12

## 0.0.16

### Patch Changes

- ded9252: Rename delta → output across all APIs and flatten StepResult
  - `StepConfig.delta` → `StepConfig.output`
  - `StepOutput` → `StepReturn` (step run return type)
  - `StepDelta<S>` → `StepOutput<S>` (utility type)
  - `Step.deltaSchema` → `Step.outputSchema`, `Step.outputDeltaSchema` → `Step.partialOutputSchema`
  - `StepResult.output` flattened: `output`, `events`, `commands` as top-level fields
  - `RecomputeResult.deltaDiff` → `outputDiff`, `parsedDelta` → `parsedOutput`, `output` → `rawOutput`
  - `StateSnapshot` → `RunState`
  - `CommitParams.delta` → `CommitParams.output`, `CommitParams.events` optional
  - Remove `Delta<T>` type alias (use `Partial<T>` directly)

- Updated dependencies [ded9252]
- Updated dependencies [ded9252]
  - verist@0.0.4
  - @verist/storage@0.0.11

## 0.0.15

### Patch Changes

- a7cd6f1: Improve DX ergonomics across packages
  - `StepReturn.events` is now optional (defaults to `[]`)
  - `createSnapshotFromResult` auto-captures commands when present (opt out with `captureCommands: false`)
  - `extract()` accepts step context — reads `ctx.adapters.llm` and `ctx.onArtifact` automatically
  - Export `LLMContext` type alias for `StepContext<{ llm: LLMProvider }>`
  - `store.load()` returns `err({ code: "not_found" })` instead of `ok(null)`
  - `resolveBlock` uses `FOR UPDATE` locking to prevent concurrent resolver races

- Updated dependencies [a7cd6f1]
  - verist@0.0.3
  - @verist/storage@0.0.10

## 0.0.14

### Patch Changes

- 31c3c00: Consolidate `@verist/core` + `@verist/replay` into single `verist` package
  - Merge core (step/workflow/run) and replay (snapshot/diff/recompute) into `verist` with curated root exports and `verist/internals` subpath for sibling packages
  - `@verist/cli`: `verist` is now a regular dependency (not peer) so `npm i -g @verist/cli` works standalone
  - All packages: import paths updated from `@verist/core` / `@verist/replay` to `verist`
  - Delete unused packages: `@verist/batch`, `@verist/pipeline`, `@verist/queue`, `@verist/otel`, `@verist/artifacts`

- Updated dependencies [31c3c00]
- Updated dependencies [81cdfe6]
  - verist@0.0.2
  - @verist/storage@0.0.9

## 0.0.13

### Patch Changes

- Updated dependencies [a07b649]
  - @verist/core@0.0.9
  - @verist/replay@0.0.14
  - @verist/storage@0.0.8

## 0.0.12

### Patch Changes

- Updated dependencies [eab0dd8]
  - @verist/core@0.0.8
  - @verist/replay@0.0.13
  - @verist/storage@0.0.7

## 0.0.11

### Patch Changes

- 61aba83: Add generic type parameter to `RunStore.load<T>()`

  `load<T>()` now accepts a type parameter like `commit<T>()` and `setOverlay<T>()`, returning `RunState<T>` instead of `StateSnapshot<unknown>`. Eliminates manual casts at call sites.

  ```ts
  const snap = await store.load<MyState>(workflowId, runId);
  snap.value!.computed.score; // typed
  ```

- Updated dependencies [61aba83]
- Updated dependencies [61aba83]
- Updated dependencies [61aba83]
  - @verist/core@0.0.7
  - @verist/storage@0.0.6
  - @verist/replay@0.0.12

## 0.0.10

### Patch Changes

- 3a00052: Add generic type parameter to `RunStore.load<T>()`

  `load<T>()` now accepts a type parameter like `commit<T>()` and `setOverlay<T>()`, returning `RunState<T>` instead of `StateSnapshot<unknown>`. Eliminates manual casts at call sites.

  ```ts
  const snap = await store.load<MyState>(workflowId, runId);
  snap.value!.computed.score; // typed
  ```

- Updated dependencies [3a00052]
  - @verist/storage@0.0.5

## 0.0.9

### Patch Changes

- Updated dependencies [35ef0de]
  - @verist/replay@0.0.11

## 0.0.8

### Patch Changes

- Updated dependencies [1ce7f88]
  - @verist/replay@0.0.10

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
