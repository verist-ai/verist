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
│       │          │  3. Commit output + events             │    │
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
│       │          │  Step output Human    Audit trail      │    │
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
Step returns { output, events, commands }
       │
       ▼
Runner commits output + events to DB
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
recompute(snapshot, step, { adapters, validate: true })
       │
       ▼
Compare original vs new output
       │
       ▼
Return { status, outputDiff, commandsDiff, schemaViolations }
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
| Step definition   | `verist`                                 | Define step logic                   |
| Run execution     | `verist`                                 | Call `run()` in your runner         |
| Snapshot creation | `verist`                                 | Persist snapshots                   |
| Replay/recompute  | `verist`                                 | Load snapshots, run `recompute()`   |
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

## Deep dive

For contributors and advanced users, the following resources cover kernel internals and design rationale.

**Specifications** – formal contracts for each kernel subsystem:

- [Overview](../specs/overview) – core concepts, invariants, API surface
- [Steps](../specs/steps) – step execution semantics
- [Commands](../specs/commands) – command type system and semantics
- [Replay](../specs/replay) – replay and recompute contracts
- [Suspend](../specs/suspend) – suspend/resume protocol
- [Kernel Invariants](../specs/kernel-invariants) – non-negotiable guarantees

**Architecture Decision Records (ADRs)** – why things are the way they are:

- [ADR-001 Determinism](../adr/001-determinism)
- [ADR-002 Commands](../adr/002-commands)
- [ADR-003 State Layers](../adr/003-state-layers)
- [ADR-004 Replay Semantics](../adr/004-replay-semantics)
- [ADR-005 Package Stability](../adr/005-package-stability)
- [ADR-006 Command Categories](../adr/006-command-categories)
- [ADR-007 Unified Run API](../adr/007-unified-run-api)
- [ADR-008 Artifact Capture](../adr/008-artifact-capture-hook)
- [ADR-009 Pipeline Errors](../adr/009-pipeline-error-handling)
- [ADR-010 Execution Loop](../adr/010-execution-loop)
- [ADR-011 Package Consolidation](../adr/011-package-consolidation)
- [ADR-012 Structured Step Errors](../adr/012-structured-step-errors)
