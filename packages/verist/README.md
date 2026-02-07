# Verist

[![npm version](https://badge.fury.io/js/verist.svg)](https://badge.fury.io/js/verist)
[![npm downloads](https://img.shields.io/npm/dm/verist.svg)](https://npmjs.com/package/verist)
[![Ask ChatGPT](https://img.shields.io/badge/Ask_ChatGPT-10a37f?logo=google+gemini&logoColor=white)](https://chatgpt.com/g/g-697e23b923088191b8cb315bebf14a3b-verist-architect)
[![Twitter Follow](https://img.shields.io/twitter/follow/verist_ai?style=social)](https://x.com/verist_ai)

Deterministic workflow kernel for AI systems — replay + diff for AI decisions.

Update a prompt or model, recompute against past inputs, and see exactly what decisions would change before shipping. Human corrections survive recomputation by design.

## Install

```bash
npm install verist zod
```

## Quick Example

```ts
import { defineStep, run, recompute, formatDiff } from "verist";
import { z } from "zod";

const OutputSchema = z.object({ claims: z.array(z.string()) });

// v1: precise extraction
const extractV1 = defineStep({
  name: "extract-claims",
  input: z.object({ text: z.string() }),
  output: OutputSchema,
  run: async (input) => ({
    output: { claims: ["Revenue: $5M", "Headcount: 45"] },
  }),
});

const baseline = await run(extractV1, { text: "Revenue was $5M..." });

// v2: changed logic — what breaks?
const extractV2 = defineStep({
  name: "extract-claims",
  input: z.object({ text: z.string() }),
  output: OutputSchema,
  run: async (input) => ({
    output: { claims: ["Revenue was strong"] },
  }),
});

const result = await recompute(baseline.value, extractV2);
if (result.ok) {
  console.log(result.value.status); // "value_changed"
  console.log(formatDiff(result.value.outputDiff));
  // claims[0]: "Revenue: $5M" → "Revenue was strong"
  // - claims[1]: "Headcount: 45"
}
```

For LLM-powered steps, see [`@verist/llm`](https://npmjs.com/package/@verist/llm) which adds `extract()` and `defineExtractionStep()`.

## API

### Steps

- **`defineStep(config)`** — define a step with Zod input/output schemas and a `run` function
- **`run(step, input, opts?)`** — execute a step, returns `Result<StepResult, StepError>`
- **`runStep(params)`** — execute with explicit workflow context (ID, version, artifact capture)
- **`fail(code, message, opts?)`** — return a structured error from a step (preserves error code and `retryable` flag)

### Replay and Diff

- **`recompute(baseline, step, opts?)`** — rerun a step against a previous result or snapshot, returns diff + status
- **`compareSnapshots(before, after)`** — diff two snapshots directly
- **`diff(a, b)`** — compute a diff between any two objects
- **`formatDiff(diff)`** — human-readable diff output
- **`applyDiff(target, diff)`** — apply a diff to produce a new object
- **`createSnapshotFromResult(result)`** — capture a `StepResult` as an immutable snapshot

### Workflows

- **`defineWorkflow(config)`** — declare a workflow with named steps
- **`createContextFactory(adapters)`** — create execution contexts with metadata and artifact capture

### Commands

Steps can return commands that describe what should happen next:

- **`invoke(step, input)`** — trigger another step
- **`fanout(step, items)`** — trigger a step for each item
- **`review(reason, payload?)`** — pause for human review
- **`suspend(reason, opts?)`** — pause until external resume
- **`emit(type, payload)`** — emit a domain event

### Result Type

Errors are values, not exceptions:

```ts
const result = await run(step, input);
if (result.ok) {
  console.log(result.value.output);
} else {
  // "input_validation" | "output_validation" | "execution_failed" | custom codes via fail()
  console.log(result.error.code, result.error.retryable);
}
```

### Recompute Status

`recompute()` classifies results for CI integration:

| Status             | Meaning                                     |
| ------------------ | ------------------------------------------- |
| `clean`            | Output identical to baseline                |
| `value_changed`    | Output differs (regression or improvement)  |
| `schema_violation` | New output fails baseline schema validation |

## Packages

| Package                                                              | Description                                    |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| [`verist`](https://npmjs.com/package/verist)                         | Core kernel (this package)                     |
| [`@verist/cli`](https://npmjs.com/package/@verist/cli)               | CLI — `verist init`, `capture`, `diff`, `test` |
| [`@verist/llm`](https://npmjs.com/package/@verist/llm)               | LLM adapters (OpenAI, Anthropic) with tracing  |
| [`@verist/storage`](https://npmjs.com/package/@verist/storage)       | Storage interface + in-memory store            |
| [`@verist/storage-pg`](https://npmjs.com/package/@verist/storage-pg) | PostgreSQL adapter (Drizzle ORM)               |

## Documentation

- [Getting Started](https://verist.dev/getting-started)
- [Replay and Diff Guide](https://verist.dev/guides/replay-and-diff)
- [GitHub](https://github.com/verist-ai/verist)

## License

[Apache-2.0](../../LICENSE)
