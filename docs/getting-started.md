# Getting Started

::: tip Zero-config quickstart
Run `verist init` to scaffold a working project with no API keys needed.
:::

This guide covers both CLI and programmatic usage. For how the pieces fit together in production, see [Architecture Overview](guides/architecture).

## Install

::: code-group

```bash [bun]
bun add @verist/core @verist/replay @verist/cli zod
```

```bash [npm]
npm install @verist/core @verist/replay @verist/cli zod
```

:::

## CLI Quickstart

The fastest way to see Verist in action — no API keys required:

```bash
npx verist init
npx verist capture --step parse-contact --input "verist/inputs/*.json"
npx verist test --step parse-contact
```

This scaffolds a `parse-contact` step that extracts name, email, and phone via regex. Edit the step logic, re-run `verist test`, and see the diff.

## Programmatic API

### Core concepts

Each step returns:

- **delta** – partial state update
- **events** – audit records (append-only)
- **commands** – declarative next steps (optional)

```text
(input, context) → { delta, events, commands? }
```

### Define and run a step

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

## Add explicit identity

For stable IDs and version tracking, pass explicit identity to `run()`:

```ts
import { defineWorkflow, run } from "@verist/core";

const workflow = defineWorkflow({
  name: "verify-document",
  version: "1.0.0",
  steps: { verifyDocument },
});

const result = await run(
  workflow.getStep("verifyDocument"),
  { docId: "doc-1", text: "..." },
  {
    adapters,
    workflowId: workflow.name,
    workflowVersion: workflow.version,
    runId: "run-1",
  },
);
```

## LLM Providers

Verist supports OpenAI and Anthropic via `@verist/llm`. Any OpenAI-compatible API (Ollama, Azure OpenAI, etc.) works via the `baseURL` option.

```ts
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { createOpenAI, createAnthropic } from "@verist/llm";

// OpenAI (or any compatible API via baseURL)
const openai = createOpenAI({
  client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
});

// Anthropic
const anthropic = createAnthropic({
  client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
});

// Ollama, Azure, etc.
const ollama = createOpenAI({
  client: new OpenAI({
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",
  }),
});
```

## Runner wiring

Verist does not ship an orchestrator. A minimal runner typically does:

1. Load state
2. Execute `run()` with explicit identity
3. Commit delta + events atomically
4. Interpret commands (enqueue, fan-out, review, emit)
5. Capture artifacts if you need replay/recompute

See [Reference Runner](./guides/reference-runner) for a concrete loop.

## Kernel guarantees

Verist guarantees:

- Steps are deterministic given input + adapters
- State lives in your database
- Commands are data (never executed by the kernel)
- Overlay wins over computed for human overrides
- Errors are values (`Result`), not exceptions

## Commands

Commands are plain objects. Use helpers for common patterns:

```ts
import { invoke, fanout, review, emit } from "@verist/core";

return {
  delta,
  events,
  commands: [
    invoke("verify", { id }), // call another step
    fanout("score", inputs), // parallel execution
    review("low confidence", data), // human review
    emit("doc.verified", { id }), // external event
  ],
};
```

## Decision checklist

| If you...               | Then skip...     |
| ----------------------- | ---------------- |
| Don't store state yet   | Storage adapters |
| Don't branch or fan out | Commands         |
| Don't pause runs        | Suspend/resume   |
| Don't need stable IDs   | Workflows        |
