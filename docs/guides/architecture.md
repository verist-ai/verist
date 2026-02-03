# Architecture Overview

This page shows how Verist fits into a production system. Use it to understand the full picture before diving into specific guides.

## System diagram

```text
┌────────────────────────────────────────────────────────────────┐
│                         Your System                            │
│                                                                │
│  ┌─────────┐     ┌────────────────────────────────────────┐    │
│  │  Queue  │────▶│              Runner                    │    │
│  └─────────┘     │                                        │    │
│       ▲          │  1. Load state from DB                 │    │
│       │          │  2. Call run(step, input, ctx)         │    │
│       │          │  3. Commit delta + events              │    │
│       │          │  4. Enqueue commands                   │    │
│       │          │  5. Capture artifacts → snapshot       │    │
│       │          └────────────────────────────────────────┘    │
│       │                          │                             │
│       │                          ▼                             │
│       │          ┌────────────────────────────────────────┐    │
│       │          │            Database                    │    │
│       │          │                                        │    │
│       │          │  computed   overlay   events           │    │
│       │          │  ────────   ───────   ──────           │    │
│       │          │  Step deltas Human    Audit trail      │    │
│       │          │             overrides                  │    │
│       │          │                                        │    │
│       │          │  effective = { ...computed, ...overlay }    │
│       │          └────────────────────────────────────────┘    │
│       │                          │                             │
│       │                          ▼                             │
│       │          ┌────────────────────────────────────────┐    │
│       │          │         Snapshot Store                 │    │
│       │          │                                        │    │
│       │          │  Artifacts + metadata for replay       │    │
│       └──────────└────────────────────────────────────────┘    │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Review UI                            │   │
│  │                                                         │   │
│  │  Show diff → Human approves/overrides → Write overlay   │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

## What Verist provides vs what you provide

| You provide           | Verist provides                                |
| --------------------- | ---------------------------------------------- |
| Queue and runner loop | `run()`, `defineStep`, `defineWorkflow`        |
| Database and storage  | State layer semantics (computed, overlay)      |
| Snapshot persistence  | `createSnapshotFromResult()`, artifact capture |
| Review UI             | Diff formatting, replay, recompute             |
| LLM adapters          | Context factory, artifact hooks                |

Verist is a kernel. You wire it into your infrastructure.

## Happy path: run a step

```text
Queue job arrives
       │
       ▼
Runner loads state from DB
       │
       ▼
run(step, input, ctx)
       │
       ▼
Step returns { delta, events, commands }
       │
       ▼
Runner commits delta + events to DB
       │
       ▼
Runner enqueues commands
       │
       ▼
Runner captures snapshot (if needed)
```

## Recompute path: model upgrade

```text
Load snapshot from store
       │
       ▼
recompute(snapshot, step, newCtx)
       │
       ▼
Compare original vs new output
       │
       ▼
Return { deltaDiff, commandsDiff }
       │
       ▼
Review UI shows diff
       │
       ▼
Reviewer approves or overrides
       │
       ▼
If override: write to overlay
```

## Human override path

```text
Step produces computed = 0.42
       │
       ▼
Reviewer disagrees, sets overlay = 0.90
       │
       ▼
Later: model upgrade, recompute
       │
       ▼
New computed = 0.38
       │
       ▼
Effective = 0.90 (overlay wins)
```

Human decisions survive recomputation. The overlay is never overwritten by steps.

## Where each component lives

| Component         | Package                                  | Your responsibility                 |
| ----------------- | ---------------------------------------- | ----------------------------------- |
| Step definition   | `@verist/core`                           | Define step logic                   |
| Run execution     | `@verist/core`                           | Call `run()` in your runner         |
| Snapshot creation | `@verist/replay`                         | Persist snapshots                   |
| Replay/recompute  | `@verist/replay`                         | Load snapshots, run `recompute()`   |
| State storage     | `@verist/storage` + `@verist/storage-pg` | Storage contract + Postgres adapter |
| Queue             | Your choice                              | Job dispatch and retry              |
| Review UI         | Your choice                              | Display diffs, collect overrides    |

## Key guarantees

| Guarantee             | How it works                                          |
| --------------------- | ----------------------------------------------------- |
| Determinism           | Given recorded artifacts, step output is reproducible |
| Audit trail           | Every step emits structured events                    |
| Human authority       | Overlay always wins over computed                     |
| Explicit control flow | Commands are data, not implicit execution             |
| Safe retries          | Steps are idempotent by design                        |

## When to read what

| Goal                        | Read                                   |
| --------------------------- | -------------------------------------- |
| Understand the mental model | [Concepts](../concepts/overview)       |
| Get started quickly         | [First Step](./first-step)             |
| Learn replay and diff       | [Replay and Diff](./replay-and-diff)   |
| Build a runner              | [Reference Runner](./reference-runner) |
| Add human overrides         | [Human Overrides](./overrides)         |
| Store state                 | [Storage and State](./storage)         |
