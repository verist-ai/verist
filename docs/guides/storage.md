# Storage and State

Verist keeps state in your database. The kernel never holds state for you.

## The state layers

| Layer        | Description               |
| ------------ | ------------------------- |
| **computed** | Derived from step outputs |
| **overlay**  | Human overrides           |

Effective state is `{ ...computed, ...overlay }`. Overlay always wins.

## What to store per step

Every successful step should result in three writes:

| Write        | Purpose                    |
| ------------ | -------------------------- |
| **Delta**    | Computed state update      |
| **Events**   | Audit log                  |
| **Commands** | For your runner to execute |

::: warning
If you skip any of them, you break replay guarantees.
:::

## Storage adapters

`@verist/storage` defines the `RunStore` contract and provides `createMemoryStore()` for dev and tests:

```ts
import { createMemoryStore, effectiveState } from "@verist/storage";

const store = createMemoryStore();
```

For production, use `@verist/storage-pg` which adds:

- Optimistic concurrency via Postgres
- Persistent computed + overlay state
- Audit event persistence
- Command outbox hooks

You can also implement the `RunStore` contract yourself.

## Minimal commit flow

```ts
const result = await run(step, input, ctx);

if (result.ok) {
  await store.commit({
    workflowId: result.value.workflowId,
    runId: result.value.runId,
    stepId: result.value.stepName,
    expectedVersion: currentVersion,
    delta: result.value.output.delta,
    events: result.value.output.events,
  });

  for (const cmd of result.value.output.commands ?? []) {
    await queue.enqueue(cmd);
  }
}
```

See [Reference Runner](./reference-runner) for a full loop with artifact capture.

## Concurrency and retries

Steps are idempotent by design, so retries are safe.

Use optimistic locking (version column or compare-and-swap) to prevent two workers from committing different deltas for the same run.

## Anti-patterns

- Writing state inside steps
- Storing computed state in memory between runs
- Dropping audit events to save space
