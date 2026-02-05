# Core Concepts

This page explains the mental model to carry into the rest of the docs.

::: tip
Prefer learning by code? Start with [Your First Step](../guides/first-step) and come back later.
:::

## Verist in one sentence

Verist is a deterministic workflow kernel for AI systems: replay, recompute, and diffs for decisions.

## The big idea

Most AI workflows are hard to trust because you can't reproduce decisions or understand what changed after a model upgrade. Verist fixes that by being strict about:

| Discipline                 | Why it matters                                   |
| -------------------------- | ------------------------------------------------ |
| **Explicit inputs**        | No hidden dependencies                           |
| **Explicit artifacts**     | Store what the model saw and returned            |
| **Explicit state changes** | Steps return outputs, nothing else mutates state |

That discipline makes replay and diff possible.

## Core objects

### Step

A deterministic function that takes input + context and returns:

| Field        | Description                        |
| ------------ | ---------------------------------- |
| **output**   | Partial state update               |
| **events**   | Audit records                      |
| **commands** | What should happen next (optional) |

A step is the only place where "work" happens.

**What a step is NOT:** task runner, scheduler, database writer, internal retry mechanism.

### Workflow

A named set of steps plus a version. It doesn't run on its own – your runner does.

**What a workflow is NOT:** orchestrator, self-executing runtime, required for single-step usage.

### State

State lives in your database. Not in memory. Not in a hidden framework cache.

| Layer         | Source                        |
| ------------- | ----------------------------- |
| **computed**  | Derived from step outputs     |
| **overlay**   | Human overrides               |
| **effective** | `{ ...computed, ...overlay }` |

Overlay always wins so human decisions survive recomputation.

### Artifacts

Captured inputs/outputs from non-deterministic calls (LLMs, external APIs, file reads). Stored and hashed.

Artifacts make replay and recompute possible. They are not logs – they are required for exact replay.

### Replay vs recompute

|         | Replay           | Recompute            |
| ------- | ---------------- | -------------------- |
| Uses    | Stored artifacts | Fresh adapters       |
| Answers | "What happened?" | "What would change?" |

## Common mistakes

- Confusing replay with recompute
- Expecting workflows to "run themselves"
- Treating artifacts as logs instead of inputs/outputs

## Why the kernel is strict

Verist refuses to be "helpful" in ways that hide state or control flow. That's the only way to make AI decisions reviewable later.

If you want speed and autonomy, an agent framework might fit better. If you want correctness under scrutiny, Verist is built for you.
