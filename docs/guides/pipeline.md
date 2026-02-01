# Pipelines

A pipeline runs steps in sequence with explicit boundaries.

Use it when you want composition without building a full orchestrator.

## What pipelines are good for

- Clean, linear flow: `extract → verify → score`
- Explicit checkpoints between stages
- Clear audit trail between stages

## What pipelines are not

- A graph engine
- A scheduler
- A replacement for your queue

## Mental model

A pipeline is a list of stages. Each stage takes the current state and produces a delta. The runner applies each delta and moves on.

## When to use what

| Use case         | Use       |
| ---------------- | --------- |
| Linear flow      | Pipeline  |
| Branching        | Commands  |
| Audit + identity | Workflow  |
| One-off          | Bare step |

If your flow is not linear, see [Workflows](./workflows) first.

## Design tips

- Keep stages small and deterministic
- Emit audit events per stage
- Capture artifacts at stage boundaries
