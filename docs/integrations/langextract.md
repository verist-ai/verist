# LangExtract

Wrap [LangExtract](https://github.com/google/langextract) extraction calls in a Verist step — get replay, regression diffs, and [human override preservation](../guides/overrides.md).

## What LangExtract does

LangExtract is a Python library (by Google) for structured extraction from unstructured text. It maps extractions to source locations for traceability and uses schema-constrained generation on supported models (Gemini) with few-shot guidance as fallback elsewhere.

## Why pair with Verist

| Concern            | LangExtract               | Verist                           |
| ------------------ | ------------------------- | -------------------------------- |
| Extraction quality | Prompts, source grounding | –                                |
| Reproducibility    | –                         | Replay from stored artifacts     |
| Regression diffs   | –                         | See which entities changed       |
| Stable array diffs | –                         | `keyBy` matches entities by ID   |
| Human corrections  | –                         | Overlay layer survives recompute |

## Example: extraction step

LangExtract runs as a Python service. Your Verist step calls it via an adapter.

```ts
import { z } from "zod";
import { defineStep, run, createSnapshotFromResult } from "verist";

const entitySchema = z.object({
  id: z.string(),
  class: z.string(),
  text: z.string(),
  attributes: z.record(z.string()).optional(),
});

const extractEntities = defineStep({
  name: "extract-entities",
  input: z.object({ documentId: z.string(), text: z.string() }),
  output: z.object({ entities: z.array(entitySchema) }),

  // Match entities by id instead of array index during diff.
  // Prevents noisy diffs when the LLM returns entities in different order.
  keyBy: { entities: "id" },

  run: async (input, ctx) => {
    const entities = await ctx.adapters.extractor.extract(input.text);
    return {
      output: { entities },
      events: [
        { type: "entities_extracted", payload: { count: entities.length } },
      ],
    };
  },
});
```

Wire the adapter when running the step:

```ts
const result = await run(
  extractEntities,
  { documentId: "doc-42", text: clinicalNote },
  {
    adapters: {
      extractor: {
        extract: async (text) => {
          const res = await fetch("http://localhost:8000/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });
          if (!res.ok) throw new Error(`Extraction failed: ${res.status}`);
          const body = await res.json();
          return body.entities; // LangExtract response → entities array
        },
      },
    },
  },
);

if (result.ok) {
  const snapshot = await createSnapshotFromResult(result.value);
  await db.snapshots.insert(snapshot);
}
```

This example captures step output as a snapshot for diffing. For byte-accurate replay of the extraction call itself, emit the raw request/response as artifacts via [`onArtifact`](../guides/replay-and-diff.md#artifact-capture-in-runners).

## Recompute + diff

After upgrading your extraction model or prompt, recompute to see what changed:

```ts
import { recompute, formatDiff } from "verist";

const recomputeResult = await recompute(snapshot, extractEntities, {
  adapters: { extractor: newExtractor }, // [!code highlight]
});

if (recomputeResult.ok) {
  const { status, outputDiff } = recomputeResult.value;
  console.log("Status:", status);
  // "clean" | "value_changed" | "schema_violation"

  if (outputDiff && !outputDiff.equal) {
    console.log(formatDiff(outputDiff));
  }
}
```

::: tip Production tips

- **Pin the model version** (e.g., `gemini-2.5-flash`) — diffs are meaningless if the baseline model drifts.
- **Use temperature 0** for extraction — non-determinism adds noise to diffs.
- **Ensure stable IDs** on extracted entities — `keyBy` needs them to match elements across runs.

:::

## `keyBy` for extraction results

LLMs often return array elements in unstable order. Without `keyBy`, recompute reports every entity as changed whenever the order shifts.

```ts
keyBy: { entities: "id" },
```

Verist normalizes arrays into maps keyed by `id` before diffing. Only actual content changes appear in the diff.

For composite keys (e.g., class + text), use a function:

```ts
keyBy: {
  entities: (item) => {
    const e = item as { class: string; text: string };
    return `${e.class}::${e.text}`;
  },
},
```

::: warning
Keys must be unique and present on every element. Duplicate or missing keys cause recompute to fail with `normalization_failed`.
:::

## See also

- [Your First Step](../guides/first-step.md) — minimal setup
- [Replay and Diff](../guides/replay-and-diff.md) — the full recompute flow
- [Human Overrides](../guides/overrides.md) — preserving corrections across recomputes
