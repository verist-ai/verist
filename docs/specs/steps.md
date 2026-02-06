# SPEC: Steps

Authoritative spec for step definition, execution, context, and error handling.

## Step Definition

A step is a pure function with typed input and output schemas:

```typescript
const step = defineStep({
  name: "extract",
  input: z.object({ documentId: z.string() }),
  output: z.object({ claims: z.array(z.string()) }),
  run: async (input, ctx) => {
    return { output: { claims: ["..."] } };
  },
});
```

### Properties

| Property | Type                                                 | Description                                               |
| -------- | ---------------------------------------------------- | --------------------------------------------------------- |
| `name`   | `string`                                             | Unique step identifier (default `workflowId` in `run()`). |
| `input`  | `z.ZodType<TInput>`                                  | Input schema (strictly validated).                        |
| `output` | `z.ZodType<TOutput>`                                 | Output schema; runtime output is `Partial<TOutput>`.      |
| `run`    | `(input, ctx) => Promise<StepReturn \| StepFailure>` | Step logic.                                               |

### `StepReturn`

```typescript
interface StepReturn<TOutput extends object> {
  output: Partial<TOutput>;
  events?: AuditEvent[];
  commands?: Command[];
}
```

`output` is a partial state update; `events` and `commands` are optional.

### `StepFailure`

Steps can return structured errors via `fail()` instead of throwing:

```typescript
run: async (input, ctx: LLMContext) => {
  const result = await extract(ctx, request, schema);
  if (!result.ok) return fail(result.error);
  return { output: result.value.data };
};
```

See ADR-012. `runStep()` and `recompute()` preserve `code` and `retryable`. Thrown exceptions become `execution_failed`.

## Step Context

Context is injected into `run()` as the second parameter.

```typescript
interface StepContext<TAdapters extends BaseAdapters = BaseAdapters> {
  adapters: TAdapters;
  workflowId: string;
  workflowVersion: string;
  runId: string;
  onArtifact?: OnArtifact;
  emitEvent: (event: AuditEvent) => void;
}
```

### Adapters

External services are injected via `adapters`. The type is inferred from the `ctx` annotation:

```typescript
// LLMContext alias covers the common case
run: async (input, ctx: LLMContext) => { ... }

// Custom adapters use StepContext<T> directly (or a type alias)
type ReviewContext = StepContext<{ requireReview: boolean }>;
run: async (input, ctx: ReviewContext) => { ... }
```

### `emitEvent`

Emits audit events during execution. Events are merged with `StepReturn.events`.

### `onArtifact`

Captures adapter-emitted artifacts during execution (e.g., `llm-input`, `llm-output`). `StepResult.artifacts` contains only adapter-emitted kinds; reserved kinds (`step-output`, `step-commands`) are created at snapshot time.

## Step Execution

### `run()` – Simplified API

```typescript
const result = await run(step, input, { adapters: { llm } });
```

Defaults: `workflowId = step.name`, `workflowVersion = "0.0.0"`, `runId = crypto.randomUUID()`.

### `runStep()` – Full Control

```typescript
const result = await runStep({
  step,
  input,
  contextFactory: createContextFactory(adapters),
  workflowId: "my-workflow",
  workflowVersion: "1.0.0",
  runId: crypto.randomUUID(),
});
```

For explicit workflow/version control, custom context factories, and multi-step workflows.

### Execution Flow

1. Validate input (`input_validation` on failure)
2. Create context (with `emitEvent`, `onArtifact`)
3. Run step; `StepFailure` becomes `StepError`, throws become `execution_failed`
4. Validate output (`output_validation` on failure)
5. Merge events; collect artifacts; return `Result<StepResult, StepError>`

### `StepResult`

```typescript
interface StepResult<TInput, TOutput extends object> {
  input: TInput;
  output: Partial<TOutput>;
  events: AuditEvent[];
  commands?: Command[];
  artifacts: Artifact[]; // adapter-emitted only; reserved kinds added at snapshot time
  stepName: string;
  workflowId: string;
  workflowVersion: string;
  runId: string;
}
```

### `StepError`

```typescript
interface StepError {
  code: StepErrorCode;
  message: string;
  retryable: boolean; // always present — normalized by runStep()
  cause?: unknown;
}

type StepErrorCode =
  | "input_validation"
  | "output_validation"
  | "execution_failed"
  | (string & {}); // open for step-defined codes
```

`retryable` is always present on `StepError` and means “safe to retry with identical input and context.” Kernel-owned codes are `input_validation`, `output_validation`, `execution_failed`. Other codes are domain-specific.

## Extraction Steps

`defineExtractionStep` in `@verist/llm` eliminates boilerplate for the common LLM extraction pattern:

```typescript
import { defineExtractionStep } from "@verist/llm";

const step = defineExtractionStep({
  name: "extract-job",
  input: z.object({ text: z.string() }),
  output: schema,
  request: (input) => ({
    model: "gpt-4o",
    messages: [{ role: "user", content: `Extract: ${input.text}` }],
    responseFormat: "json",
  }),
});
```

Internally calls `defineStep` + `extract` + `fail`. Use `defineStep` + `extract()` for custom logic (pre/post-processing, multiple LLM calls, conditional extraction).
