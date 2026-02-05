# Why Verist

Verist is a deterministic, audit-first workflow kernel for AI systems. It gives you replay, recompute, and diffs for AI decisions – so you can upgrade models and prompts without guessing what will break.

## The trust gap

Modern AI workflows create failures you cannot reproduce:

- Decisions change silently with model or prompt updates
- Logs show what happened, but not why
- Human corrections get overwritten by recomputation
- Agent frameworks introduce hidden state and emergent control flow

Acceptable for demos. Not for review-heavy or high-impact systems.

## What Verist gives you

| Capability                | Description                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Replay + diff**         | Capture artifacts during a run, replay exactly, or recompute and review the diff before shipping         |
| **Database-backed state** | All state lives in your database. Steps return outputs; nothing important is implicit or in memory       |
| **Audit-first**           | Every step produces structured audit events. The evidence trail is part of the API, not optional logging |
| **Human authority**       | Human overrides are first-class and survive recomputation                                                |
| **Minimal kernel**        | Small, explicit library that fits under your existing runner, queue, and UI                              |

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

## When Verist fits

Use Verist when:

- AI decisions must be reproducible and explainable
- Model/prompt upgrades need reviewable diffs
- Human review is part of the workflow
- You are accountable to audits, compliance, or users

## When to skip Verist

- Internal chatbots without audit or replay requirements
- Fast prototypes and throwaway scripts
- Exploratory agents where outcomes are intentionally non-deterministic
- One-off scripts where you don't need diff or long-term replay

If you want speed over correctness, Verist will feel heavy.
