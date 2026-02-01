# Mental Map

Verist can feel bigger than it is. This page shows what you **must** know first, what is **optional**, and when to come back for the rest.

::: tip See the full picture
For a system-level view of how all the pieces connect, see [Architecture Overview](./architecture).
:::

## Adoption levels

### Level 1 – One step, immediate value

**Goal:** Replay + diff without workflow ceremony.

What to learn:

- `defineStep` + `run()`
- Audit events
- Capture a snapshot and recompute diff

::: tip
Most users can stop here and still get 80% of the value.
:::

**Read:** [Your First Step](./first-step), [Replay and Diff](./replay-and-diff)

### Level 2 – Stable identity

**Goal:** Make decisions reproducible across deploys.

What to learn:

- Explicit `workflowId` / `workflowVersion`
- Storing snapshots
- Human review of diffs

**Read:** [Workflows](./workflows), [Human Overrides](./overrides)

### Level 3 – Multi-step workflows

**Goal:** Compose steps safely.

What to learn:

- `defineWorkflow`
- Typed `invoke` / `fanout`
- Commands as control flow

**Read:** [Workflows](./workflows), [Storage and State](./storage)

### Level 4 – Persistence and human review

**Goal:** Production correctness under review.

What to learn:

- Storage adapters
- Computed vs overlay state
- Overrides and audit trails
- Runner wiring

**Read:** [Storage and State](./storage), [Human Overrides](./overrides), [Reference Runner](./reference-runner)

### Level 5 – Advanced

**Goal:** Scale, pause, and batch safely.

What to learn:

- Suspend / resume
- Batch recompute
- Pipelines

**Read:** [Suspend and Resume](./suspend-resume), [Batch Runs](./batch), [Pipelines](./pipeline)

## What you can ignore (for now)

- **Specs and ADRs** – useful for guarantees and deep details, not required to use Verist
- **Pipelines** – only needed for strict linear orchestration
- **Suspend / resume** – only for long-running or human-in-the-loop steps

## Decision checklist

| If you...                          | Stay at... |
| ---------------------------------- | ---------- |
| Only need replay + diff            | Level 1    |
| Need stable IDs across deployments | Level 2    |
| Have multiple steps                | Level 3    |
| Need human review or overrides     | Level 4    |
| Need pause/batch/linear pipelines  | Level 5    |
