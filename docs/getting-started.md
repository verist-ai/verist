# Getting Started

Verist is a deterministic workflow kernel for AI systems. Each step returns:

- state delta (partial update)
- audit events (append-only log)
- optional commands (declarative next steps)

It is designed for workflows where you need replay, diff, and auditability.

## Quick start

For the fastest path to "wrap one function, get replay + diff", see [Your First Step](guides/first-step.md).

This guide covers the full production setup.

## Is Verist a good fit?

Use Verist if you need:

- replayable AI decisions ("what happened, exactly?")
- safe model/prompt upgrades with reviewable diffs
- audit trails and human overrides that survive recomputation

Verist is not an agent runtime, chat framework, or orchestrator. It is the trust kernel underneath those systems.

## Install

```bash
bun add @verist/core zod
```

Optional packages:

```bash
bun add @verist/replay
bun add @verist/storage @verist/storage-pg
```

## 5-minute quickstart

A step is a function that returns a delta + events (and optional commands). Steps are deterministic given their input and adapters.

### Simplest form: `run()`

```ts
import { z } from "zod";
import { defineStep, run } from "@verist/core";

const summarize = defineStep({
  name: "summarize",
  input: z.object({ text: z.string() }),
  delta: z.object({ summary: z.string() }),
  run: async (input, ctx) => {
    const summary = await ctx.adapters.llm.summarize(input.text);
    return {
      delta: { summary },
      events: [
        { type: "summary_created", payload: { length: summary.length } },
      ],
    };
  },
});

const result = await run(
  summarize,
  { text: "Verist makes AI decisions replayable." },
  {
    adapters: {
      llm: { summarize: async (text) => `Summary: ${text.slice(0, 40)}...` },
    },
  },
);

if (result.ok) {
  console.log(result.value.output.delta);
  // { summary: "Summary: Verist makes AI decisions rep..." }
}
```

### Production form: `runStep()`

For explicit control over workflow/version/runId, use `runStep`:

```ts
import { defineWorkflow, runStep, createContextFactory } from "@verist/core";

const workflow = defineWorkflow({
  name: "hello-verist",
  version: "0.1.0",
  steps: { summarize },
});

const result = await runStep({
  step: workflow.getStep("summarize"),
  input: { text: "Verist makes AI decisions replayable and diffable." },
  contextFactory: createContextFactory({
    llm: { summarize: async (text) => `Summary: ${text.slice(0, 40)}...` },
  }),
  workflowId: workflow.name,
  workflowVersion: workflow.version,
  runId: "run-1",
});
```

### What just happened

- `defineStep` validated input and output using Zod
- `run` / `runStep` returned a `Result` (errors are values, not exceptions)
- You got a delta and events (your runner persists these in production)

For production state management with optimistic concurrency, see `@verist/storage`.

## The "aha": replay + recompute diff

The replay package (`@verist/replay`) lets you capture artifacts from a step, replay exactly what happened, or recompute with new adapters and inspect the diff.

```ts
import {
  captureArtifact,
  createSnapshot,
  replay,
  recompute,
  formatDiff,
} from "@verist/replay";

const output = result.value.output;
const artifacts = [captureArtifact("step-output", output)];

const snapshot = createSnapshot({
  workflowId,
  workflowVersion,
  stepName: result.value.stepName,
  input: result.value.input, // validated input from execution
  artifacts,
});

const replayResult = await replay(snapshot, async (hash) => {
  return artifactStore.get(hash); // you provide storage
});

if (replayResult.ok) {
  console.log("replayed", replayResult.value.output);
}

const recomputeCtx = contextFactory({
  workflowId,
  workflowVersion,
  runId: "recompute-1",
});

const recomputeResult = await recompute(
  snapshot,
  workflow.getStep("summarize"),
  recomputeCtx,
);

if (recomputeResult.ok && !recomputeResult.value.diff.equal) {
  console.log(formatDiff(recomputeResult.value.diff));
}
```

Notes:

- `replay()` uses stored artifacts and returns the captured `step-output` when present
- `recompute()` re-runs the step with live adapters and produces a diff
- `recompute()` works with either a bare step or a workflow step — workflow identity only matters for versioning
- artifact storage is external (database, blob store, etc.)

## How to think about Verist

### Step contract

```
(input, context) -> { delta, events, commands? }
```

- **delta** is a partial state update (validated against the step's `delta` schema)
- **events** are immutable audit records
- **commands** are declarative intent, interpreted by your runner

### Kernel invariants (high-value guarantees)

Verist guarantees, among others:

- steps are deterministic given input + adapters
- state lives in your database
- commands are data (never executed by the kernel)
- overlay wins over computed for human overrides
- errors are values (`Result`), not exceptions

See `docs/specs/kernel-invariants.md` for the full list.

## Common command patterns

Commands are plain objects. You can create them manually or use helpers.

```ts
import { invoke, fanout, review, emit } from "@verist/core";

return {
  delta,
  events,
  commands: [
    invoke("verify", { id }),
    fanout("score", inputs),
    review("low confidence", { score }),
    emit("doc.verified", { id }),
  ],
};
```

Commands are validated by shape, not by step registry. Use free-form commands (`invoke`, `fanout`) when running standalone steps. Use `workflow.invoke()` and `workflow.fanout()` when you want compile-time type safety for step inputs.

## Production wiring (high level)

Verist does not ship an orchestrator. Your runner typically does:

1. load state (`RunStore` or your own store)
2. execute `runStep`
3. commit delta + events atomically
4. interpret commands (enqueue, fan-out, review, emit)
5. capture artifacts if you need replay/recompute

This boundary is deliberate: the kernel stays universal, orchestration stays yours.

## Next steps

- Overview and concepts: `docs/specs/overview.md`
- Kernel guarantees: `docs/specs/kernel-invariants.md`
- Replay and recompute: `docs/specs/replay.md`
- Package stability tiers: `docs/adr/005-package-stability.md`
