# Verist

[![npm version](https://badge.fury.io/js/@verist%2Fcore.svg)](https://badge.fury.io/js/@verist%2Fcore)
[![npm downloads](https://img.shields.io/npm/dm/@verist/core.svg)](https://npmjs.com/package/@verist/core)
[![Ask ChatGPT](https://img.shields.io/badge/Ask_ChatGPT-10a37f?logo=google+gemini&logoColor=white)](https://chatgpt.com/g/g-697e23b923088191b8cb315bebf14a3b-verist-architect)
[![Twitter Follow](https://img.shields.io/twitter/follow/verist_ai?style=social)](https://x.com/verist_ai)

**Replay + diff for AI decisions — see what changes before you ship.**

A deterministic workflow kernel that captures AI outputs as artifacts, replays them exactly, and shows reviewable diffs when prompts or models change. Human corrections survive recomputation by design.

Ask **Verist Architect** in [ChatGPT](https://chatgpt.com/g/g-697e23b923088191b8cb315bebf14a3b-verist-architect) or [Gemini](https://gemini.google.com/gem/16ofP3wcDulLXY0oj7EXhRlVtws9A8znp?usp=sharing) about replay semantics, diffs, and kernel invariants.

## Why Verist

You tweak a prompt, upgrade a model, or change extraction logic. AI decisions silently change. A missing field breaks downstream code, a reclassified ticket confuses support, a weaker extraction goes unnoticed — until customers report it.

You can't answer the question that matters: **"What decisions would change?"**

- Logs show what happened, not what _would_ change
- Testing on 3 examples doesn't catch the 2% regression in production
- When you recompute, human corrections get overwritten

So you don't ship. Or you ship and hope.

Verist gives you a different workflow:

```text
change prompt → recompute → see diff → approve → ship
```

- **Diff before shipping** — See what would change after a prompt or model upgrade
- **Replay any decision** — Reproduce past AI decisions exactly from stored artifacts
- **Human authority preserved** — Manual overrides survive recomputation by design

Verist is not logging or observability — it is deterministic replay with reviewable diffs.

## Install

```bash
npm install @verist/core @verist/replay zod
```

## Quickstart

See what breaks when you change a prompt — in under 60 seconds:

```bash
OPENAI_API_KEY=sk-... bun examples/prompt-diff/quickstart.ts
```

```text
✓ Baseline: 4 claims (specific numbers, names, dates)
✓ Recompute: 3 claims (vague summaries)

--- Diff ---
  claims[0]: "Acme Corp reported $4.2M in Q3 revenue" → "Acme Corp had strong Q3 revenue growth"
- claims[3]: "Plans to expand engineering team from 45 to 60 by March 2025"
```

Full example: [`examples/prompt-diff/`](./examples/prompt-diff/)

## How It Works

Verist captures AI outputs as artifacts. When you change something, replay against stored inputs and see a diff.

```typescript
import { z } from "zod";
import { defineStep, run, unwrap } from "@verist/core";
import { recompute, formatDiff } from "@verist/replay";

// Define a step with typed input/output
const extractClaims = defineStep({
  name: "extract-claims",
  input: z.object({ text: z.string() }),
  delta: z.object({ claims: z.array(z.string()) }),
  run: async (input, ctx) => {
    const claims = await ctx.adapters.llm.extract(input.text);
    return { delta: { claims }, events: [] };
  },
});

// Run with artifact capture
const result = unwrap(
  await run(
    extractClaims,
    { text },
    {
      adapters: { llm },
      onArtifact: (a) => store.save(a),
    },
  ),
);

// Later: change prompt, recompute from snapshot
const recomputeResult = unwrap(
  await recompute(snapshot, extractClaims, newCtx),
);
console.log(formatDiff(recomputeResult.deltaDiff));
```

## When to Use

- **Prompt iteration** — Test changes against production history before deploying
- **Model upgrades** — Quantify impact of switching models (GPT-4 → Claude, etc.)
- **Safe recompute** — Rerun AI logic without overwriting human corrections
- **Decision audit** — Replay any past decision exactly, with full provenance

Verist is not a chat framework or agent runtime. It's the trust layer that makes AI decisions reproducible and reviewable.

## Packages

| Package              | Purpose                                       |
| -------------------- | --------------------------------------------- |
| `@verist/core`       | Step/workflow definition, execution           |
| `@verist/replay`     | Artifact capture, replay, recompute with diff |
| `@verist/storage-pg` | PostgreSQL storage with overlay support       |
| `@verist/pipeline`   | Sequential step composition                   |
| `@verist/batch`      | Parallel execution with concurrency control   |
| `@verist/llm`        | LLM adapters (OpenAI, Anthropic)              |

## Documentation

- [Getting Started](https://verist.dev/getting-started)
- [Replay and Diff Guide](https://verist.dev/guides/replay-and-diff)

## Links

[![npm version](https://badge.fury.io/js/@verist%2Fcore.svg)](https://npmjs.com/package/@verist/core)
[![Twitter](https://img.shields.io/twitter/follow/verist_ai?style=social)](https://x.com/verist_ai)

## License

[Apache-2.0](LICENSE)
