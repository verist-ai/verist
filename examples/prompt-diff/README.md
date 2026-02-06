# Prompt Diff Quickstart

You changed a prompt. What broke? This example detects regressions in under 60 seconds.

## Prerequisites

- [Bun](https://bun.sh/) or Node.js 22+
- `OPENAI_API_KEY` environment variable

## Run

```bash
bun install
OPENAI_API_KEY=sk-... bun examples/prompt-diff/quickstart.ts
```

Or with Node.js 22+:

```bash
npm install
npm run build
OPENAI_API_KEY=sk-... node --experimental-strip-types examples/prompt-diff/quickstart.ts
```

## What it does

1. **Baseline** — Extracts specific claims from sample text using a precise prompt
2. **Recompute** — Re-runs extraction with a vague "summarize" prompt using the baseline result
3. **Diff** — Shows exactly which claims were lost or changed

## Example output

Exact wording may vary; what matters is the diff shows loss of specificity.

```
✓ Baseline: 4 claims
  • Acme Corp reported $4.2M in Q3 revenue
  • Revenue up 18% year-over-year
  • CEO Jane Park announced 3 new enterprise clients
  • Plans to expand engineering team from 45 to 60 people by March 2025

✓ Recompute: 3 claims
  • Acme Corp had strong Q3 revenue growth
  • New enterprise clients were announced
  • Engineering team expansion planned

--- Diff ---
  claims[0]: "Acme Corp reported $4.2M..." → "Acme Corp had strong Q3..."
- claims[3]: "Plans to expand engineering..."
```

The diff reveals the regression: the vague prompt lost specific numbers and names.
