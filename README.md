# Verist

[![npm version](https://badge.fury.io/js/verist.svg)](https://badge.fury.io/js/verist)
[![npm downloads](https://img.shields.io/npm/dm/verist.svg)](https://npmjs.com/package/verist)
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
npm install verist @verist/cli zod
```

## Quickstart

Get started with no API keys — `verist init` scaffolds a deterministic step using regex extraction:

```bash
npx verist init
npx verist capture --step parse-contact --input "verist/inputs/*.json"
npx verist test --step parse-contact
```

### Next: LLM Diffs

Once you have API keys, define an LLM-powered step and see what changes when you modify prompts:

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
import { defineStep, run, unwrap, recompute, formatDiff } from "verist";

// Define a step with typed input/output
const extractClaims = defineStep({
  name: "extract-claims",
  input: z.object({ text: z.string() }),
  output: z.object({ claims: z.array(z.string()) }),
  run: async (input, ctx) => {
    const claims = await ctx.adapters.llm.extract(input.text);
    return { output: { claims } };
  },
});

// Run with artifact capture
const result = unwrap(
  await run(extractClaims, { text }, { adapters: { llm } }),
);

// Later: change prompt, recompute from snapshot
const recomputeResult = unwrap(
  await recompute(snapshot, extractClaims, { adapters: { llm: newLlm } }),
);
console.log(formatDiff(recomputeResult.outputDiff));
```

## CI Integration

Use `--format json` or `--format markdown` for machine-readable output:

```bash
verist test --step extract-claims --format json    # structured JSON for scripts
verist test --step extract-claims --format markdown # PR comment summary
```

See [CI Integration Guide](./docs/guides/ci-integration.md) for GitHub Actions examples.

## When to Use

- **Prompt iteration** — Test changes against production history before deploying
- **Model upgrades** — Quantify impact of switching models (GPT-4 → Claude, etc.)
- **Safe recompute** — Rerun AI logic without overwriting human corrections
- **Decision audit** — Replay any past decision exactly, with full provenance

Verist is not a chat framework or agent runtime. It's the trust layer that makes AI decisions reproducible and reviewable.

## Packages

| Package              | Purpose                                                      |
| -------------------- | ------------------------------------------------------------ |
| `verist`             | Step/workflow definition, execution, replay, recompute, diff |
| `@verist/cli`        | CLI — replay, diff, and inspect baselines                    |
| `@verist/llm`        | LLM provider adapters with tracing                           |
| `@verist/storage`    | Storage interface and layered state model                    |
| `@verist/storage-pg` | PostgreSQL storage adapter (Drizzle ORM)                     |

## Documentation

- [Getting Started](https://verist.dev/getting-started)
- [CI Integration Guide](./docs/guides/ci-integration.md)
- [Replay and Diff Guide](https://verist.dev/guides/replay-and-diff)

## Links

[![npm version](https://badge.fury.io/js/verist.svg)](https://npmjs.com/package/verist)
[![Twitter](https://img.shields.io/twitter/follow/verist_ai?style=social)](https://x.com/verist_ai)

## License

[Apache-2.0](LICENSE)
