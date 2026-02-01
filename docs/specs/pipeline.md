# SPEC: Pipeline Composition

Composing steps into linear sequences with automatic chaining and error propagation.

## Problem

Real workflows are sequences of steps:

```text
upload → parse → extract → verify → compute
```

Currently, each step must explicitly return `invoke` commands to trigger the next step. This creates boilerplate and scatters the pipeline definition across step implementations.

Pipelines provide:

- Declarative sequence definition in one place
- Automatic output→input wiring
- Unified error handling across the sequence

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
interface Pipeline {
  name: string;
  version: string;
  stages: PipelineStageConfig[];
}

interface PipelineStageConfig {
  step: Step<any, any, any>;
  wire?: (prevDelta: unknown, pipelineInput: unknown) => unknown;
  onError?: "fail" | "skip"; // Default: fail
}

interface PipelineResult<T> {
  ok: boolean;
  runId: string;
  stages: StageResult[];
  output?: T; // Final delta if successful
  error?: PipelineError; // Present iff failed (mutually exclusive with suspendedAt)
  suspendedAt?: string; // Step name if blocked; set for both suspend and review (use StageResult.blockedBy to distinguish)
}

interface StageResult {
  stepName: string;
  status: "completed" | "failed" | "skipped" | "suspended";
  delta?: unknown;
  events: AuditEvent[];
  commands?: Command[];
  durationMs: number;
  error?: PipelineError; // Present when status is "skipped" or "failed"
  blockedBy?: "suspend" | "review"; // Present when status is "suspended"
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
import { definePipeline } from "@verist/pipeline";

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
  runId: "run-123",
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
- `"skip"` — Stage marked skipped, previous stage's delta is carried forward (stored in `StageResult.delta`). The error that caused the skip is recorded in `StageResult.error` for debugging. Events are empty since the step did not complete.

## Semantics

- **runId:** All stages share the same runId. If omitted, it defaults to `crypto.randomUUID()` and requires Web Crypto (Node 19+, Bun, Deno, modern browsers).
- **Audit events:** Only recorded for completed or suspended stages. Failed and skipped stages always have empty `events`.
- **Control commands:** If a stage returns `invoke` or `fanout`, execution throws immediately (pipelines do not support control commands).
- **Blocking commands:** At most one blocking command (`suspend` or `review`) per stage. Multiple blocking commands throw. When `suspend` is present, sibling commands are discarded. When `review` is present, sibling commands are preserved (deferred).

## Relationship to Commands

Pipelines are **compile-time composition**. Commands are **runtime routing**.

| Aspect       | Pipeline        | Commands                       |
| ------------ | --------------- | ------------------------------ |
| When defined | Code time       | Step execution time            |
| Routing      | Static sequence | Dynamic based on step output   |
| Use case     | Known sequences | Conditional branching, fan-out |

**Commands in pipeline stages:** Control commands (`invoke`, `fanout`) are not allowed in pipeline stages — use commands for dynamic routing outside pipelines. Side-effect commands (`emit`) are allowed and pass through. Blocking commands (`suspend`, `review`) stop the pipeline and return with `suspendedAt` set.

**Command execution:** Pipeline runner does not execute commands — it returns them in `StageResult.commands` for downstream consumers to handle. When `blockedBy=review`, all commands in the result are deferred (none executed by the runner).
