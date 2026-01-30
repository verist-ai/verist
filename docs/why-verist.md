# Why Verist

Verist is a deterministic, audit-first workflow kernel for AI systems.
It gives you replay, recompute, and diffs for AI decisions so you can upgrade models and prompts without guessing what will break.

## The trust gap in AI workflows

Modern AI workflows create failures you cannot reproduce:

- Decisions change with model or prompt updates
- Logs show what happened, but not why
- Human corrections get overwritten by recomputation
- Agent frameworks introduce hidden state and emergent control flow

These are acceptable for demos, but not for review-heavy or high-impact systems.

## What Verist gives you

### Replay + diff

Capture artifacts during a run, replay exactly, or recompute and review the diff before shipping changes.

### Explicit state in your database

All workflow state lives in your database. Steps return deltas; nothing important is implicit or in memory.

### Audit-first by contract

Every step produces structured audit events and LLM traces. The evidence trail is part of the API, not optional logging.

### Human authority preserved

Human overrides are first-class and survive recomputation.

### Minimal, composable kernel

Verist is not a platform. It is a small, explicit library that fits under your existing runner, queue, and UI.

## Mental model: Git for AI decisions

Verist workflows are built to make change reviewable:

```
change prompt -> recompute -> see diff -> approve or override -> persist
```

When you can see the diff, you can ship with confidence.

## How Verist differs from agent frameworks

Agent frameworks optimize for autonomy and speed. Verist optimizes for control and accountability.

| Dimension       | Agent frameworks        | Verist                      |
| --------------- | ----------------------- | --------------------------- |
| Primary goal    | Autonomy, speed         | Trust, correctness          |
| Control flow    | Often implicit          | Explicit, code-defined      |
| State           | In-memory + checkpoints | Database as source of truth |
| Replay          | Best-effort             | Exact, artifact-based       |
| Auditability    | Optional                | Core primitive              |
| Human overrides | Fragile                 | Preserved by design         |

Verist can sit underneath an agent framework when you need guarantees, or replace ad-hoc scripts when a workflow becomes critical.

## When Verist is the right fit

Use Verist when:

- AI decisions must be reproducible and explainable
- Model/prompt upgrades need reviewable diffs
- Human review is part of the workflow
- You are accountable to audits, compliance, or users

If you are still prototyping and want speed over correctness, Verist will feel heavy.

## Where to start

- Read `docs/getting-started.md` for a quick walkthrough.
- Use `@verist/replay` to enable replay + recompute diff.
- Add `@verist/storage-pg` for atomic commits and audit persistence.
