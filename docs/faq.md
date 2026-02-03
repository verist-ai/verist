# FAQ

## Is Verist a framework or a library?

A library. It doesn't run your system. It gives you strict primitives (steps, deltas, artifacts, replay) that you wire into your own runner.

## Can I use Verist with an agent framework?

Yes. Verist sits underneath agent frameworks to provide replay and diffs – the trust layer.

## Why explicit state?

Replay only works when you can reconstruct exact inputs and state for a run. Hidden state makes decisions impossible to reproduce.

## Do I need a database?

For production, yes. Verist assumes your database is the source of truth. For dev and tests, use `createMemoryStore()` from `@verist/storage` — no database required.

## Where do I start?

[Your First Step](./guides/first-step) – a single file that gives you replay + diff without a full workflow. For a learning path, see [Mental Map](./guides/mental-map).

## Replay vs recompute?

|         | Replay           | Recompute              |
| ------- | ---------------- | ---------------------- |
| Uses    | Stored artifacts | Fresh adapters         |
| Output  | Byte-identical   | May differ             |
| Purpose | Audit, reproduce | Test changes, see diff |

### When to use which

| Scenario                  | Use               |
| ------------------------- | ----------------- |
| Incident investigation    | Replay            |
| Bug reproduction          | Replay            |
| Model upgrade             | Recompute         |
| Prompt change             | Recompute         |
| What-if analysis          | Recompute         |
| Backfill on historic data | Batch + recompute |

## Will recompute overwrite human changes?

No. Human overrides live in the overlay state and always take precedence.

## Where do artifacts live?

You decide. Most teams store artifacts in a blob store with references in the database.

## Can I use Verist without LLMs?

Yes. Verist works for any deterministic step. LLMs are the most common use case.
