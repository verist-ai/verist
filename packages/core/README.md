# @verist/core

[![npm version](https://badge.fury.io/js/@verist%2Fcore.svg)](https://badge.fury.io/js/@verist%2Fcore)
[![npm downloads](https://img.shields.io/npm/dm/@verist/core.svg)](https://npmjs.com/package/@verist/core)
[![Ask ChatGPT](https://img.shields.io/badge/Ask_ChatGPT-10a37f?logo=google+gemini&logoColor=white)](https://chatgpt.com/g/g-697e23b923088191b8cb315bebf14a3b-verist-architect)
[![Twitter Follow](https://img.shields.io/twitter/follow/verist_ai?style=social)](https://x.com/verist_ai)

Deterministic workflow engine for AI systems.

## Installation

```bash
bun add @verist/core zod
```

## Quick Start

```typescript
import { z } from "zod";
import { defineStep, run } from "@verist/core";

const summarize = defineStep({
  name: "summarize",
  input: z.object({ text: z.string() }),
  delta: z.object({ summary: z.string() }),
  run: async (input, ctx) => ({
    delta: { summary: await ctx.adapters.llm.summarize(input.text) },
    events: [{ type: "summarized" }],
  }),
});

const result = await run(
  summarize,
  { text: "Hello world" },
  {
    adapters: { llm: { summarize: async (t) => `Summary: ${t}` } },
  },
);

if (result.ok) {
  console.log(result.value.input); // validated input
  console.log(result.value.output.delta); // { summary: "Summary: Hello world" }
}
```

For the full guide, see the [documentation](https://github.com/verist-ai/verist).

## Production Usage

For production, use `runStep` with explicit workflow identity:

```typescript
import { defineWorkflow, runStep, createContextFactory } from "@verist/core";

const workflow = defineWorkflow({
  name: "verify-document",
  version: "1.0.0",
  steps: { summarize },
});

const result = await runStep({
  step: workflow.getStep("summarize"),
  input: { text: "..." },
  contextFactory: createContextFactory({ llm: myLlm }),
  workflowId: workflow.name,
  workflowVersion: workflow.version,
  runId: crypto.randomUUID(),
});
```

## API

### `defineStep(config)`

Define a workflow step with typed input and delta schemas. The `delta` schema defines which fields this step can contribute to workflow state; the actual delta returned by `run()` is validated as a partial.

### `defineWorkflow(config)`

Group named steps into a workflow. Version is required.

```typescript
const workflow = defineWorkflow({
  name: "verify-document",
  version: "1.0.0",
  steps: { extract, verify },
});

// Type-safe step access
const step = workflow.getStep("extract");

// Type-safe commands (input is inferred from step schema)
const cmd = workflow.invoke("verify", { claims: ["claim1"] });
const fanoutCmd = workflow.fanout("verify", [
  { claims: ["a"] },
  { claims: ["b"] },
]);
```

### `run(step, input, options)`

Simplified step execution with sensible defaults.

- `workflowId` defaults to step name
- `workflowVersion` defaults to `"0.0.0"`
- `runId` defaults to random UUID

### `runStep(params)`

Full step execution with explicit workflow identity. Use this in production for stable versioning and multi-step workflows.

**Note:** `run()` and `runStep()` have identical execution semantics once running. They differ in identity discipline — `run()` generates defaults while `runStep()` requires explicit values. `run()` may throw early if the runtime cannot generate a runId (provide `runId` explicitly to avoid this). Verist does not enforce how results are persisted.

### `createContextFactory(adapters)`

Create a context factory from adapters. The factory attaches execution metadata at runtime.

### Command Helpers

Commands express "what should happen next" as data. External runners interpret them.

```typescript
import { invoke, fanout, review, emit, suspend } from "@verist/core";

// Request another step
commands: [invoke("nextStep", { id: input.id })];

// Parallel processing
commands: [
  fanout(
    "processItem",
    items.map((i) => ({ id: i })),
  ),
];

// Human-in-the-loop
commands: [review("confidence below threshold", { score: 0.5 })];

// External integration
commands: [emit("slack:alerts", { message: "Verification complete" })];

// Await external input (pauses workflow)
commands: [
  suspend({
    reason: "awaiting_documentation",
    checkpoint: { claimId },
    resumeStep: "handleDocumentation",
  }),
];
```

`review` and `suspend` are blocking — they halt sibling command execution. See SPEC-commands and SPEC-suspend for full semantics.

### Result Helpers

- `ok(value)` - Create success result
- `err(error)` - Create error result
- `unwrap(result)` - Extract value or throw
- `map(result, fn)` - Transform success value
- `mapErr(result, fn)` - Transform error value
- `flatMap(result, fn)` - Chain result-returning functions
- `isOk(result)` / `isErr(result)` - Type guards
