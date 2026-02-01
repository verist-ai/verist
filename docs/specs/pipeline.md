# SPEC: Pipeline Composition

Composing steps into linear sequences with automatic chaining and error propagation.

## Problem

Real workflows are sequences of steps:

```
upload → parse → extract → verify → compute
```

Currently, each step must explicitly return `invoke` commands to trigger the next step. This creates boilerplate and scatters the pipeline definition across step implementations.

Pipelines provide:

- Declarative sequence definition in one place
- Automatic output→input wiring
- Unified error handling across the sequence
- Pipeline-level replay and observability

## Concepts

**Pipeline** — An ordered sequence of steps where each step's output feeds the next step's input.

**Wiring** — The transformation from one step's delta to the next step's input. Can be automatic (pass-through) or explicit (mapper function).

**Pipeline Run** — Single execution of a pipeline with its own `runId`. All stages share the same `runId` (unlike batch, where each item gets a distinct `runId`).

**Terminal State** — Pipeline reaches terminal state when: all steps complete (success), a step fails (failure), or a step suspends (suspended). See SPEC-suspend for suspend semantics.

## Design Principles

1. **Pipeline is metadata** — Defines sequence and wiring; steps remain pure
2. **Steps don't know about pipelines** — A step works identically standalone or in pipeline
3. **Wiring is explicit** — No magic; transformations are visible and testable
4. **Composition, not inheritance** — Pipelines compose steps; steps don't extend a base class

## Types

```typescript
interface Pipeline<TInput, TOutput> {
  name: string;
  version: string;
  stages: PipelineStage[];
}

interface PipelineStage {
  step: Step<any, any>;
  wire?: (prevDelta: unknown, pipelineInput: unknown) => unknown;
  onError?: "fail" | "skip"; // Default: fail
}

interface PipelineResult<T> {
  ok: boolean;
  runId: string;
  stages: StageResult[];
  output?: T; // Final delta if successful
  error?: PipelineError; // Present iff failed (mutually exclusive with suspendedAt)
  suspendedAt?: string; // Step name if suspended (mutually exclusive with error)
}

interface StageResult {
  stepName: string;
  status: "completed" | "failed" | "skipped" | "suspended";
  delta?: unknown;
  events: AuditEvent[];
  durationMs: number;
}

interface PipelineError {
  stepName: string;
  code: string;
  message: string;
  cause?: StepError;
}
```

## API

### Defining a Pipeline

```typescript
import { definePipeline, wire } from "@verist/pipeline";

const documentPipeline = definePipeline({
  name: "process-document",
  version: "1.0.0",
  stages: [
    { step: parseDocument },
    { step: extractClaims, wire: (prev) => ({ markdown: prev.markdown }) },
    { step: verifyClaims, wire: (prev) => ({ claims: prev.claims }) },
    {
      step: computeCoverage,
      wire: (prev, input) => ({
        applicationId: input.applicationId,
        verifiedClaims: prev.verifiedClaims,
      }),
    },
  ],
});
```

### Running a Pipeline

```typescript
import { runPipeline } from "@verist/pipeline";

const result = await runPipeline({
  pipeline: documentPipeline,
  input: { documentId: "doc-123", applicationId: "app-456" },
  contextFactory,
  workflowId: "doc-processing",
  runId: generateRunId(),
});

if (result.ok) {
  console.log("Coverage computed:", result.output);
} else if (result.suspendedAt) {
  console.log(`Pipeline suspended at ${result.suspendedAt}`);
} else {
  console.log(
    `Pipeline failed at ${result.error.stepName}:`,
    result.error.message,
  );
}
```

### Wiring Functions

Wiring transforms the previous step's delta into the next step's input.

```typescript
// Explicit wiring
{
  step: extractClaims,
  wire: (prevDelta, pipelineInput) => ({
    markdown: prevDelta.markdown,
    documentId: pipelineInput.documentId,
  }),
}

// Pass-through (default when wire is omitted)
// First stage receives pipeline input; subsequent stages receive previous delta

// Helper for common patterns
import { pick, merge, map } from "@verist/pipeline";

{ step: nextStep, wire: pick("fieldA", "fieldB") }
{ step: nextStep, wire: merge((prev) => prev.data, (_, input) => ({ id: input.id })) }
```

### Error Handling

```typescript
const pipeline = definePipeline({
  name: "resilient-pipeline",
  version: "1.0.0",
  stages: [
    { step: fetchData },
    {
      step: enrichData,
      onError: "skip", // Continue without enrichment
    },
    { step: finalize },
  ],
});
```

Error modes:

- `"fail"` (default) — Pipeline terminates, returns error
- `"skip"` — Stage marked skipped, previous stage's delta is preserved and passed forward

### Pipeline-Level Replay

Replay requires pipeline execution snapshots; capture is implementation-defined.

```typescript
import { replayPipeline } from "@verist/pipeline";

// Replay entire pipeline from captured artifacts
const { output, stageDiffs } = await replayPipeline(
  pipelineSnapshot,
  artifactStore,
);

// See what changed at each stage
for (const { stageName, diff } of stageDiffs) {
  if (!diff.equal) {
    console.log(`${stageName} output changed:`, formatDiff(diff));
  }
}
```

## Relationship to Commands

Pipelines are **compile-time composition**. Commands are **runtime routing**.

| Aspect       | Pipeline        | Commands                       |
| ------------ | --------------- | ------------------------------ |
| When defined | Code time       | Step execution time            |
| Routing      | Static sequence | Dynamic based on step output   |
| Use case     | Known sequences | Conditional branching, fan-out |

**Commands in pipeline stages:** Routing commands (`invoke`, `fanout`) are not allowed in pipeline stages — use commands for dynamic routing outside pipelines. Side-effect commands (`emit`) are allowed but are not replayed and not reflected in pipeline diffs. Blocking commands (`suspend`, `review`) stop the pipeline and return with `suspendedAt` set.
