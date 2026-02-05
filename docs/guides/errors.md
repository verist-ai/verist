# Error Handling

Verist treats errors as values. A step returns `Result<T, StepError>` and **never throws** for expected failures.

## Error types

| Code                | Cause                        |
| ------------------- | ---------------------------- |
| `input_validation`  | Input does not match schema  |
| `execution_failed`  | Adapter or step logic threw  |
| `output_validation` | Output does not match schema |

All three return a `Result` with a `StepError` value.

## Basic handling

```ts
const result = await run(step, input, ctx);

if (!result.ok) {
  switch (result.error.code) {
    case "input_validation":
    case "output_validation":
      // bug in caller or step; fix and retry safely
      break;
    case "execution_failed":
      // external dependency or transient failure
      break;
  }
}
```

## Response patterns

| Error type             | Response                                               |
| ---------------------- | ------------------------------------------------------ |
| Validation errors      | Treat as bugs or incompatible inputs; fix and rerun    |
| Execution errors       | Classify as transient vs permanent; retry only if safe |
| Partial batch failures | Keep per-item `Result` and re-run only failures        |

## Suspend vs error

If the run needs **human input** or **external confirmation**, prefer a `suspend` command instead of throwing.

- Errors are for failures
- Suspends are for waiting

## Errors in recompute

Recompute can surface errors that never happened in the original run:

- A new adapter behaves differently
- A prompt changed in a way that broke assumptions
- A dependency became unavailable

Treat error diffs as high-priority regressions in review.

::: info
Output validation in `recompute()` is **observational** – it populates `schemaViolations` instead of returning an error. This lets you see schema issues alongside value diffs rather than short-circuiting. Input validation remains strict (`err(input_validation)`).
:::

## Audit

- Persist `StepError` details alongside the run
- Record retry attempts as audit events
- Keep error metadata stable so diffs are reviewable
