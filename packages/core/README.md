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

For the full guide, see [verist.dev](https://verist.dev/getting-started).

## Production Usage

For production, pass explicit workflow identity:

```typescript
import { defineWorkflow, run } from "@verist/core";

const workflow = defineWorkflow({
  name: "verify-document",
  version: "1.0.0",
  steps: { summarize },
});

const result = await run(
  workflow.getStep("summarize"),
  { text: "..." },
  {
    adapters: { llm: myLlm },
    workflowId: workflow.name,
    workflowVersion: workflow.version,
    runId: crypto.randomUUID(),
  },
);
```

## API

### `defineStep(config)`

Define a workflow step with typed input and delta schemas. The `delta` schema defines which fields this step can contribute to workflow state; the actual delta returned by `run()` is validated as a partial.

### `defineWorkflow(config)`

Group named steps into a workflow. `name` and `version` must be non-empty strings.

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

Execute a step with typed I/O and audit events.

```typescript
const result = await run(step, input, {
  adapters,                    // Required: runtime dependencies
  workflowId?: string,         // Default: step.name
  workflowVersion?: string,    // Default: "0.0.0"
  runId?: string,              // Default: crypto.randomUUID()
  onArtifact?: (artifact) => void, // Optional: capture for replay
});
```

**Identity defaults:** For quick start, identity parameters are optional. For production, pass explicit values to enable stable audit trails and replay.

**Artifact capture:** When `onArtifact` is provided, core emits a `step-output` artifact. Adapters can emit additional artifacts (e.g., `llm-input`, `llm-output`) via the same callback passed through context. See ADR-008.

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

`review` and `suspend` are blocking. `review` defers sibling commands; `suspend` discards siblings. See SPEC-commands and SPEC-suspend for full semantics.

### Result Helpers

- `ok(value)` - Create success result
- `err(error)` - Create error result
- `unwrap(result)` - Extract value or throw
- `map(result, fn)` - Transform success value
- `mapErr(result, fn)` - Transform error value
- `flatMap(result, fn)` - Chain result-returning functions
- `isOk(result)` / `isErr(result)` - Type guards
