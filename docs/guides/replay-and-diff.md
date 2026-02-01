# Replay and Diff

This is the heart of Verist. If you only use one feature, use this.

| Capability    | Description                                          |
| ------------- | ---------------------------------------------------- |
| **Replay**    | Re-run a past decision and get byte-identical output |
| **Recompute** | Run the same step with a new model or prompt         |
| **Diff**      | See exactly what changed before you ship             |

## The flow

```text
run step → capture artifacts → store snapshot → later: recompute and diff
```

## 1. Run a step

```ts
import { defineStep, run } from "@verist/core";
import { z } from "zod";

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

const result = await run(
  verifyDocument,
  { docId: "doc-1", text: "Hello" },
  {
    adapters: { llm: yourLlmAdapter },
    workflowId: "verify-document",
    workflowVersion: "1.0.0",
    runId: "run-1",
  },
);
```

## 2. Capture artifacts and store snapshot

```ts
import { createSnapshotFromResult } from "@verist/replay";

if (!result.ok) throw new Error(result.error.message);

const snapshot = await createSnapshotFromResult(result.value, {
  captureCommands: true, // required for command diffing
});

await db.snapshots.insert(snapshot);
```

### Artifact capture in runners

Artifacts are emitted via `onArtifact` during execution. Store them, then attach to the snapshot:

```ts
import type { Artifact } from "@verist/core";

const extraArtifacts: Artifact[] = [];

const result = await run(verifyDocument, input, {
  adapters,
  onArtifact: (artifact) => {
    if (artifact.kind !== "step-output" && artifact.kind !== "step-commands") {
      extraArtifacts.push(artifact);
    }
  },
});

if (result.ok) {
  const snapshot = await createSnapshotFromResult(result.value, {
    captureCommands: true,
    artifacts: extraArtifacts,
  });
  await snapshotStore.save(snapshot);
}
```

### Storage options

| Setup               | Use case                                                 |
| ------------------- | -------------------------------------------------------- |
| In-memory           | Local dev, quick iteration                               |
| Blob store (S3/GCS) | Store artifact content, keep references in DB            |
| Database            | Snapshot metadata in DB, large payloads in content store |

## 3. Recompute and diff later

```ts
import { recompute, formatDiff } from "@verist/replay";
import { createContextFactory } from "@verist/core";

const ctx = createContextFactory({
  llm: newModelAdapter, // [!code highlight]
})({
  workflowId: snapshot.workflowId,
  workflowVersion: snapshot.workflowVersion,
  runId: "recompute-1",
});

const recomputeResult = await recompute(snapshot, verifyDocument, ctx);

if (recomputeResult.ok) {
  const { deltaDiff, commandsDiff } = recomputeResult.value;
  if (deltaDiff && !deltaDiff.equal) console.log(formatDiff(deltaDiff));
  if (commandsDiff && !commandsDiff.equal)
    console.log(formatDiff(commandsDiff));
}
```

## What gets diffed

| What changed            | How it shows up                             |
| ----------------------- | ------------------------------------------- |
| State delta             | `deltaDiff` from `recompute()`              |
| Control flow            | `commandsDiff` (requires `captureCommands`) |
| Inputs across snapshots | `inputDiff` from `compareSnapshots()`       |

::: info
Events are audit logs and are **not** diffed. If original output is missing or hash-only, `deltaDiff` is `undefined`.
:::

## Replay vs recompute

| Situation                   | Use               |
| --------------------------- | ----------------- |
| Audit / incident review     | Replay            |
| Debugging a past decision   | Replay            |
| Model or prompt upgrade     | Recompute         |
| New adapter or feature flag | Recompute         |
| Backfill on historic data   | Batch + recompute |

## What to capture

Capture anything that can change across runs:

- LLM input and output
- External API responses
- File contents
- Feature flags or config that affects behavior

**Rule:** If it can change, it should be an artifact.

## Common mistakes

| Mistake                        | Consequence                  |
| ------------------------------ | ---------------------------- |
| Not capturing artifacts        | Replay won't be exact        |
| Not storing snapshots          | Recompute becomes impossible |
| Mixing side effects into steps | Non-deterministic outputs    |
