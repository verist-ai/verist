---
layout: home
title: "Verist — Replay + diff for AI decisions"
description: "Deterministic, audit-first workflow kernel for production AI systems."

hero:
  name: Verist
  text: Replay + diff for AI decisions
  tagline: See exactly what changes when you update a prompt or model — before it hits production.
  actions:
    - theme: brand
      text: Get Started
      link: /guides/first-step
    - theme: alt
      text: View on GitHub
      link: https://github.com/verist-ai/verist

features:
  - title: Deterministic Replay
    details: Exact reproduction from stored artifacts. Same inputs + recorded LLM responses = identical output every time.
  - title: Recompute with Diffs
    details: Re-run with a new prompt or model against the same inputs. See structured, field-level diffs of what changed.
  - title: Human Override Preservation
    details: Three-layer state model — computed, overlay, effective. Human corrections are never overwritten by recomputation.
  - title: Audit Trail
    details: Structured events with full decision provenance. Content-addressable hashing for every artifact.
  - title: Declarative Commands
    details: Steps return data describing what happens next — invoke, fanout, review, emit, suspend — without executing side effects.
  - title: Schema Validation
    details: Zod-based input/output schemas ensure type safety and catch structural regressions at the boundary.
---

## Minimal API

Define a step, capture a baseline, recompute with a new prompt, and see the diff.

```typescript
import { defineStep, run, recompute, formatDiff } from "verist";

const classify = defineStep({
  name: "classify-ticket",
  input: z.object({ text: z.string() }),
  output: z.object({ priority: z.enum(["high", "medium", "low"]) }),
  run: async (input, ctx) => {
    const result = await ctx.adapters.llm.extract(input.text);
    return { output: result };
  },
});

// Capture baseline
const baseline = await run(classify, { text: "..." }, { adapters });

// Recompute with new prompt
const result = await recompute(baseline, classifyV2, { adapters });

// See what changed
console.log(formatDiff(result.outputDiff));
```
