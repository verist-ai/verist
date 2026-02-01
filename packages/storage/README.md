# @verist/storage

[![npm version](https://badge.fury.io/js/@verist%2Fstorage.svg)](https://badge.fury.io/js/@verist%2Fstorage)
[![npm downloads](https://img.shields.io/npm/dm/@verist/storage.svg)](https://npmjs.com/package/@verist/storage)

Storage interfaces and state-layer helpers for Verist.

## Installation

```bash
bun add @verist/storage @verist/core
```

## What This Package Provides

- `RunStore` contract for durable workflow state
- `StateSnapshot` and commit/overlay types
- `effectiveState()` helper for computed + overlay merge
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
  load(
    workflowId: string,
    runId: string,
  ): Promise<Result<StateSnapshot | null, StorageError>>;
  commit(params: CommitParams): Promise<Result<StateSnapshot, StorageError>>;
  setOverlay(
    workflowId: string,
    runId: string,
    overlay: Partial<T>,
  ): Promise<Result<StateSnapshot<T>, StorageError>>;
}
```

Key invariants:

- `commit()` is atomic for state + events (+ optional commands in adapter implementations)
- Optimistic concurrency via `expectedVersion`
- First commit to a run must use `expectedVersion: 0`
- Conflict results include `reason` for typed retry/fatal decisions

For a production implementation, see `@verist/storage-pg`.

## License

[Apache-2.0](../../LICENSE)
