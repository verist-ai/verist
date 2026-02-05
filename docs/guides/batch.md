# Batch Runs

Batch is for running the same step across a large list of inputs with per-item outcomes.

Use cases: backfills, model upgrades, reprocessing a dataset.

## What batch gives you

| Feature            | Description                            |
| ------------------ | -------------------------------------- |
| Per-item results   | Success and failure tracked separately |
| Explicit diffs     | Each item gets its own diff            |
| No hidden failures | "Some failed" is never hidden          |

## The flow

1. Run step for each item
2. Persist each delta + events
3. Collect per-item results
4. Continue even if some items fail

## Why not just a for-loop?

You can. But most teams eventually need:

- Concurrency control
- Per-item audit events
- Explicit failure accounting
- Deterministic replay later

That's what the batch helpers are for.

## Example

```ts
const inputs = [{ id: "a" }, { id: "b" }, { id: "c" }];

for (const input of inputs) {
  const result = await run(step, input, ctxFor(input));
  if (result.ok) {
    await store.commit(...);
  } else {
    await store.recordFailure(...);
  }
}
```

For built-in concurrency and reporting, wrap this in a helper that manages parallelism and per-item accounting.

## Design tips

- Keep batch items **independent**
- Avoid cross-item shared state
- Store a **batchId** so you can trace the run later
- Use **idempotent inputs** so retries are safe
