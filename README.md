# Verist

[![npm version](https://badge.fury.io/js/@verist%2Fcore.svg)](https://badge.fury.io/js/@verist%2Fcore)
[![npm downloads](https://img.shields.io/npm/dm/@verist/core.svg)](https://npmjs.com/package/@verist/core)
[![Ask ChatGPT](https://img.shields.io/badge/Ask_ChatGPT-10a37f?logo=google+gemini&logoColor=white)](https://chatgpt.com/g/g-697e23b923088191b8cb315bebf14a3b-verist-architect)
[![Twitter Follow](https://img.shields.io/twitter/follow/verist_ai?style=social)](https://x.com/verist_ai)

**Audit-first AI workflows — know why each decision happened.**
A deterministic workflow kernel with replay, recompute, and preserved human overrides.
Ask **Verist Architect** in [ChatGPT](https://chatgpt.com/g/g-697e23b923088191b8cb315bebf14a3b-verist-architect) or [Gemini](https://gemini.google.com/gem/16ofP3wcDulLXY0oj7EXhRlVtws9A8znp?usp=sharing) about replay semantics, diffs, and kernel invariants.

## Why Verist

AI workflows create trust gaps: decisions change with model updates, logs show what but not why, and human corrections get overwritten. This breaks the moment you upgrade a model, rerun a workflow, or face a review or audit. Verist gives you:

- **Replay any decision** – Reproduce past AI decisions exactly from stored artifacts
- **Diff before shipping** – See what would change after a model or prompt upgrade
- **Human authority preserved** – Manual overrides survive recomputation by design

Verist is not logging or observability – it is deterministic replay with reviewable diffs.

```text
change prompt → recompute → see diff → approve → ship
```

## Quick Start

```bash
bun add @verist/core zod
```

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
      events: [{ type: "summary_created" }],
    };
  },
});

const result = await run(
  summarize,
  { text: "..." },
  {
    adapters: { llm: yourLlmAdapter },
  },
);
```

You now have typed I/O and audit events without rewriting your workflow.
Add `@verist/replay` when you want artifact capture, exact replay, and recompute with diff.

## Packages

| Package              | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `@verist/core`       | Workflow kernel: `defineStep`, `defineWorkflow`, `run`           |
| `@verist/replay`     | Artifact capture, exact replay, recompute with diff              |
| `@verist/pipeline`   | Sequential step composition with automatic wiring                |
| `@verist/batch`      | Batch execution with concurrency control                         |
| `@verist/storage`    | Storage interface for computed/overlay/effective state           |
| `@verist/storage-pg` | PostgreSQL storage adapter                                       |
| `@verist/llm`        | LLM provider adapters with structured tracing                    |
| `@verist/artifacts`  | Content-addressable artifact storage for workflow inputs/outputs |
| `@verist/queue`      | Job queue adapter interface for distributed workflow execution   |
| `@verist/otel`       | OpenTelemetry adapter for workflow observability                 |

## When to Use Verist

Use Verist when AI decisions need to be:

- Reproduced months later for an audit
- Reviewed by humans before going live
- Safely recomputed after model or prompt changes

Verist is **not** a chat framework, agent runtime, or visual orchestrator. It is the trust layer underneath those systems.

## How It Differs

|                 | Agent frameworks | Verist                      |
| --------------- | ---------------- | --------------------------- |
| Goal            | Autonomy, speed  | Trust, correctness          |
| State           | In-memory        | Database as source of truth |
| Replay          | Best-effort      | Exact, artifact-based       |
| Human overrides | Often fragile    | Preserved by design         |

## Documentation

- [Getting Started](https://verist.dev/getting-started)
- [Why Verist](https://verist.dev/why-verist)
- [API Reference](https://verist.dev/api)
- [Reference Runner](https://verist.dev/guides/reference-runner)
- [Replay and Diff Guide](https://verist.dev/guides/replay-and-diff)

## License

[Apache-2.0](LICENSE)
