# Your First Step

::: tip Runnable example
Try the [Prompt Diff Quickstart](https://github.com/verist-ai/verist/tree/main/examples/prompt-diff) — a single file you can run to see replay + diff in action.
:::

Wrap one function, get replay and diff. No workflows, no queues, no complexity.

## Install

::: code-group

```bash [bun]
bun add @verist/core @verist/replay zod
```

```bash [npm]
npm install @verist/core @verist/replay zod
```

:::

## Define a step

A step is a function with typed input/output and audit events.

```ts
import { z } from "zod";
import { defineStep, run } from "@verist/core";

const verifyDocument = defineStep({
  name: "verify-document",
  input: z.object({ docId: z.string(), text: z.string() }),
  delta: z.object({
    verdict: z.enum(["accept", "reject"]),
    confidence: z.number(),
  }),
  run: async (input, ctx) => {
    const verdict = await ctx.adapters.llm.verify(input.text);
    return {
      delta: { verdict, confidence: 0.84 },
      events: [{ type: "document_verified", payload: { docId: input.docId } }],
    };
  },
});
```

## Run it

```ts
const result = await run(
  verifyDocument,
  { docId: "doc-1", text: "Invoice #1042 for ACME Corp." },
  {
    adapters: {
      llm: {
        verify: async (text) => (text.includes("fraud") ? "reject" : "accept"),
      },
    },
  },
);

if (result.ok) {
  console.log(result.value.output.delta);
  // { verdict: "accept", confidence: 0.84 }
}
```

## Add replay + diff

Capture the output as a snapshot, then recompute with a new model to see what changed:

```ts
import {
  createSnapshotFromResult,
  recompute,
  formatDiff,
} from "@verist/replay";
import { createContextFactory } from "@verist/core";

if (!result.ok) throw new Error(result.error.message);

const snapshot = await createSnapshotFromResult(result.value, {
  captureCommands: true,
});

// Recompute with a different adapter
const ctx = createContextFactory({
  llm: { verify: async () => "reject" }, // [!code highlight]
})({
  workflowId: snapshot.workflowId,
  workflowVersion: snapshot.workflowVersion,
  runId: "recompute-1",
});

const recomputeResult = await recompute(snapshot, verifyDocument, ctx);

if (recomputeResult.ok) {
  const { status, deltaDiff } = recomputeResult.value;
  console.log("Status:", status); // "clean" | "value_changed" | "schema_violation"
  if (deltaDiff && !deltaDiff.equal) {
    console.log(formatDiff(deltaDiff));
    // Shows exactly which fields changed
  }
}
```

## What you get

| Feature          | Description                                      |
| ---------------- | ------------------------------------------------ |
| **Typed I/O**    | Zod schemas validate input and output            |
| **Audit events** | Structured records for every execution           |
| **Replay**       | Reproduce past runs from stored artifacts        |
| **Diff**         | See exactly what changes with new models/prompts |

## When to add explicit identity

`run()` uses defaults for workflow identity (`workflowId` = step name, `version` = "0.0.0"). Pass explicit values when you need:

- Stable workflow IDs across deployments
- Version tracking across prompt/model changes
- Multi-step workflows with typed commands
- State persistence with `@verist/storage-pg`

```ts
const result = await run(verifyDocument, input, {
  adapters,
  workflowId: "verify-document",
  workflowVersion: "1.0.0",
  runId: crypto.randomUUID(),
});
```

Most teams never need overlays or contradiction handling. Verist is useful even if you stop at replay + diff.
