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
import { defineStep, run } from "verist";
import { z } from "zod";

const verifyDocument = defineStep({
  name: "verify-document",
  input: z.object({ docId: z.string(), text: z.string() }),
  output: z.object({
    verdict: z.enum(["accept", "reject"]),
    confidence: z.number(),
  }),
  run: async (input, ctx) => {
    const verdict = await ctx.adapters.llm.verify(input.text);
    return {
      output: { verdict, confidence: 0.84 },
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
import { createSnapshotFromResult } from "verist";

if (!result.ok) throw new Error(result.error.message);

const snapshot = await createSnapshotFromResult(result.value);

await db.snapshots.insert(snapshot);
```

### Artifact capture in runners

Artifacts are emitted via `onArtifact` during execution. Store them, then attach to the snapshot:

```ts
import type { Artifact } from "verist";

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
import { recompute, formatDiff } from "verist";

const recomputeResult = await recompute(snapshot, verifyDocument, {
  adapters: { llm: newModelAdapter }, // [!code highlight]
});

if (recomputeResult.ok) {
  const { status, outputDiff, commandsDiff, schemaViolations } =
    recomputeResult.value;

  if (status === "schema_violation")
    console.log("Violations:", schemaViolations);
  if (outputDiff && !outputDiff.equal) console.log(formatDiff(outputDiff));
  if (commandsDiff && !commandsDiff.equal)
    console.log(formatDiff(commandsDiff));
}
```

## What gets diffed

| What changed            | How it shows up                             |
| ----------------------- | ------------------------------------------- |
| Output values           | `outputDiff` from `recompute()`             |
| Control flow            | `commandsDiff` (auto-captured when present) |
| Schema violations       | `schemaViolations` (requires `validate`)    |
| Inputs across snapshots | `inputDiff` from `compareSnapshots()`       |

The `status` field classifies each result: `"clean"`, `"value_changed"`, or `"schema_violation"` (highest severity wins). Command changes are orthogonal and tracked separately.

::: info
Events are audit logs and are **not** diffed. If original output is missing or hash-only, `comparable` is `false` and `outputDiff` is `undefined`.
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

## Stable diffs with `keyBy`

LLMs often return array elements in unstable order. Without identity keys, recompute reports every element as changed whenever the order shifts.

Use `keyBy` on `defineStep` to match array elements by identity instead of index:

```ts
const extractEntities = defineStep({
  name: "extract-entities",
  input: z.object({ text: z.string() }),
  output: z.object({ entities: z.array(entitySchema) }),
  keyBy: { entities: "id" }, // [!code highlight]
  run: async (input, ctx) => {
    /* ... */
  },
});
```

Verist normalizes keyed arrays into maps before diffing, so only actual content changes appear in the diff. Keys must be unique and present on every element.

For composite keys, use a function:

```ts
keyBy: {
  entities: (item) => {
    const e = item as { class: string; text: string };
    return `${e.class}::${e.text}`;
  },
},
```

## Common mistakes

| Mistake                        | Consequence                  |
| ------------------------------ | ---------------------------- |
| Not capturing artifacts        | Replay won't be exact        |
| Not storing snapshots          | Recompute becomes impossible |
| Mixing side effects into steps | Non-deterministic outputs    |
