# Your First Step

Wrap one function, get replay and diff. No workflows, no queues, no complexity.

## Install

```bash
bun add @verist/core @verist/replay zod
```

## Define a step

A step is a function with typed input/output and audit events.

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
      events: [{ type: "summarized", payload: { length: summary.length } }],
    };
  },
});
```

## Run it

```ts
const result = await run(
  summarize,
  { text: "AI decisions should be replayable." },
  {
    adapters: {
      llm: { summarize: async (text) => `Summary: ${text.slice(0, 20)}...` },
    },
  },
);

if (result.ok) {
  console.log(result.value.output.delta);
  // { summary: "Summary: AI decisions sho..." }
}
```

That's it. You just ran a Verist step.

## Add replay + diff

Capture the output as an artifact. Later, replay exactly or recompute with a new model and see what changed.

```ts
import {
  captureArtifact,
  createSnapshot,
  recompute,
  formatDiff,
} from "@verist/replay";
import { createContextFactory } from "@verist/core";

// Guard: only capture if step succeeded
if (!result.ok) {
  throw new Error(`${result.error.code}: ${result.error.message}`);
}

const artifact = captureArtifact("step-output", result.value.output);

const snapshot = createSnapshot({
  workflowId: result.value.workflowId,
  workflowVersion: result.value.workflowVersion,
  stepName: result.value.stepName,
  input: result.value.input, // validated input from execution
  artifacts: [artifact],
});

// Store snapshot (your choice: database, file, etc.)

// Later, recompute with a new model:
const newAdapters = {
  llm: { summarize: async (text) => `New model: ${text.slice(0, 30)}...` },
};

const ctx = createContextFactory(newAdapters)({
  workflowId: snapshot.workflowId,
  workflowVersion: snapshot.workflowVersion,
  runId: "recompute-1",
});

const recomputeResult = await recompute(snapshot, summarize, ctx);

if (recomputeResult.ok && !recomputeResult.value.diff.equal) {
  console.log(formatDiff(recomputeResult.value.diff));
  // Shows exactly which fields changed
}
```

## What you get

- **Typed input/output** via Zod schemas
- **Audit events** for every execution
- **Replay** from stored artifacts (byte-identical)
- **Recompute + diff** when you change models or prompts

## When to graduate to `runStep`

`run()` uses defaults for workflow identity (workflowId = step name, version = "0.0.0"). This is fine for exploring, but switch to `runStep` when you need:

- **Stable workflow IDs** across deployments
- **Version tracking** to compare results across prompt/model changes
- **Multi-step workflows** with typed commands
- **State persistence** with `@verist/storage-pg`

Most teams never need overlays or contradiction handling. Verist is useful even if you stop at replay + diff.

See [Getting Started](../getting-started.md) for the full production setup.
