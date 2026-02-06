# ADR-012: Structured Step Errors via `fail()`

## Status

Accepted

## Context

- **Problem**: Steps can only succeed (return `StepReturn`) or throw. When `extract()` returns `err({ code: "rate_limit", retryable: true })`, the step must throw, and `runStep()` re-wraps the exception as `err({ code: "execution_failed" })`. The original error code and `retryable` flag are lost. Runners that need retry logic must parse error message strings.

- **Why now**: This directly violates kernel invariant #9 (Errors Are Values) at the step boundary – the one place where it matters most. Every LLM step in the sandbox (scenarios 02, 04) works around this by throwing, losing structured error metadata that runners need for retry and audit.

- **Constraints**: Must be additive (existing steps that throw must continue to work). Must not introduce nested `Result` types that confuse the API. Must preserve the existing `StepError` contract for callers of `runStep()` and `run()`.

## Decision

- **Chosen option**: Introduce a tagged `StepFailure` value via `fail()` helper. Steps can `return fail(...)` as an alternative to throwing.
- **Rationale**:
  - Consistent with "errors as values" – failures are returned, not thrown
  - Zero-cost discrimination via `_tag` field – `runStep()` checks one property
  - Additive – existing steps that throw continue to work unchanged

### API

```typescript
import { defineStep, fail } from "verist";
import { extract, type LLMContext } from "@verist/llm";

const step = defineStep({
  name: "extract-job",
  input: z.object({ text: z.string() }),
  output: schema,
  run: async (input, ctx: LLMContext) => {
    const result = await extract(ctx, request, schema);
    if (!result.ok) return fail(result.error);
    return { output: result.value.data };
  },
});

// Caller sees structured error
const result = await run(step, input, { adapters: { llm } });
if (!result.ok && result.error.retryable) {
  // retry with backoff
}
```

### Types (Summary)

- `fail()` returns a tagged `StepFailure` with `code`, `message`, optional `retryable`, optional `cause`.
- `runStep()` and `recompute()` detect `StepFailure` and normalize to `StepError` with required `retryable`.
- Kernel-owned `StepError.code` values are `input_validation`, `output_validation`, `execution_failed`. Any other string code is treated as domain-specific.

### Detection in `runStep()` and `recompute()`

Both call `step.run()` and treat a returned `StepFailure` as a structured error, normalizing `retryable` to `false` when omitted. Thrown exceptions are still wrapped as `execution_failed`. Throwing is reserved for programmer errors and invariant violations.

## Alternatives

- **Nested `Result` from step `run()`**: Step returns `Result<StepReturn, StepError>`, `runStep()` unwraps. Rejected – creates two layers of `Result` (step → `runStep()` → caller), confusing types. Detection requires checking `.ok` on the return value, which collides with any output schema that happens to have an `ok` field.

- **Force all steps to return `Result`**: Breaking change. Rejected – forces migration of all existing steps. Mixed styles (return vs throw) are inevitable in any ecosystem.

- **Error subclasses**: Steps throw `StepError extends Error` with typed fields. Rejected – still uses exceptions for expected failures, violating invariant #9. `instanceof` checks are fragile across package boundaries.

- **`errorCode` property on standard `Error`**: Steps throw `Error` with custom properties. Rejected – no type safety, properties are optional and unstructured, easy to forget.

## Consequences

- **Positive**: Structured error codes and `retryable` flag survive from adapter through step to runner. Runners can implement retry policies without string parsing. Consistent with existing `Result` patterns in storage and LLM layers.
- **Negative**: Two return paths from steps (return value vs throw). `_tag` is a convention, not enforced by TypeScript's type system at the return site (step could return a plain object with `_tag`). Mitigated: `fail()` is the only documented way to create `StepFailure`.
- **Follow-ups**: Update SPEC-steps, SPEC-overview API sketch, kernel-invariants #9. Update sandbox scenarios 02/04 to use `fail()` instead of throwing.

## References

- SPEC-steps
- SPEC-kernel-invariants (#9: Errors Are Values)
- plan.local.md §1
- sandbox/issues.md #1
