# @verist/storage

[![npm version](https://badge.fury.io/js/@verist%2Fstorage.svg)](https://badge.fury.io/js/@verist%2Fstorage)
[![npm downloads](https://img.shields.io/npm/dm/@verist/storage.svg)](https://npmjs.com/package/@verist/storage)

Storage interfaces and state-layer helpers for Verist.

## Installation

```bash
bun add @verist/storage verist
```

## What This Package Provides

- `RunStore` contract for durable workflow state
- `createMemoryStore()` — in-memory `RunStore` for examples and tests
- `RunState` and commit/overlay types
- `effectiveState()` helper for computed + overlay merge
- `typedStore<T>()` — bind a state type to a `RunStore`, removing repeated `<T>` at each call site
- Typed storage conflict reasons for retry/fatal handling

## Layered State Model

Verist uses three logical layers:

- `computed` - values produced by steps
- `overlay` - human corrections (never overwritten by automation)
- `effective` - shallow merge where overlay wins

```ts
import { effectiveState } from "@verist/storage";

const state = {
  computed: { verdict: "reject", confidence: 0.61 },
  overlay: { verdict: "accept" },
};

const effective = effectiveState(state);
// { verdict: "accept", confidence: 0.61 }
```

## RunStore Contract

```ts
interface RunStore {
  load<T = unknown>(
    workflowId,
    runId,
  ): Promise<Result<RunState<T>, StorageError>>;
  commit<T>(
    params: CommitParams<T>,
  ): Promise<Result<RunState<T>, StorageError>>;
  setOverlay<T>(
    workflowId,
    runId,
    overlay: Partial<T>,
  ): Promise<Result<RunState<T>, StorageError>>;
}
```

Key invariants:

- `commit()` is atomic for state + events (+ optional commands in adapter implementations)
- Optimistic concurrency via `expectedVersion`
- First commit to a run must use `expectedVersion: 0`
- Conflict results include `reason` for typed retry/fatal decisions

For a production implementation, see `@verist/storage-pg`.

## In-Memory Store

For examples and tests, use the built-in in-memory store:

```ts
import { createMemoryStore } from "@verist/storage";

const store = createMemoryStore();

// Create a new run
await store.commit({
  workflowId: "verify-doc",
  runId: "run-1",
  stepId: "extract",
  expectedVersion: 0,
  output: { score: 0.8, risk: "high" },
  events: [{ type: "scored" }],
});

// Load and apply overlay
await store.setOverlay("verify-doc", "run-1", { risk: "low" });
```

No persistence, no outbox — events and commands are accepted but not stored.

## Typed Store

When all calls share the same state type, use `typedStore<T>()` to avoid repeating the type parameter:

```ts
import { createMemoryStore, typedStore } from "@verist/storage";

interface AppState {
  score: number;
  risk: string;
}

const store = typedStore<AppState>(createMemoryStore());

// T is AppState at every call site — no <AppState> needed
await store.commit({
  workflowId: "verify-doc",
  runId: "run-1",
  stepId: "extract",
  expectedVersion: 0,
  output: { score: 0.8, risk: "high" },
  events: [{ type: "scored" }],
});
```

## License

[Apache-2.0](../../LICENSE)
