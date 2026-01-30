# Verist

Replay + diff for AI decisions — the trust kernel for production workflows.

## Why Verist

AI workflows create trust gaps: decisions change with model updates, logs show what but not why, and human corrections get overwritten. Verist gives you:

- **Replay any decision** — Re-run past AI decisions from stored artifacts
- **Diff before shipping** — Upgrade models or prompts and review exactly what changes
- **Human authority preserved** — Manual overrides survive recomputation

```
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

You now have typed I/O, audit events, and replay capability — without rewriting your workflow.

## Packages

| Package              | Purpose                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `@verist/core`       | Workflow kernel: `defineStep`, `defineWorkflow`, `run`, `runStep` |
| `@verist/replay`     | Artifact capture, exact replay, recompute with diff               |
| `@verist/storage`    | State persistence with optimistic concurrency                     |
| `@verist/storage-pg` | PostgreSQL storage adapter                                        |
| `@verist/llm`        | LLM adapter with structured tracing                               |

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

## License

[Apache-2.0](LICENSE)
