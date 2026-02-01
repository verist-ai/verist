# ADR-007: Unified run() API

## Status

Accepted

## Context

- **Problem**: Two execution APIs (`run()` and `runStep()`) create confusion. Docs repeatedly explain "identical execution semantics" but different "identity discipline" – a code smell indicating unnecessary surface area.
- **Why now**: API simplification before broader adoption. Reducing cognitive load improves onboarding.
- **Constraints**: Must preserve production discipline (explicit identity for audit/replay) while enabling quick-start simplicity.

## Decision

- **Chosen option**: Single `run()` function with optional identity parameters
- **Rationale**:
  - One mental model instead of two
  - Progressive disclosure: start simple, add identity when needed
  - Matches "minimal surface area" design principle

### New API

```typescript
// Minimal (dev/testing)
const result = await run(step, input, { adapters });

// Production (explicit identity)
const result = await run(step, input, {
  adapters,
  workflowId: "verify-document",
  workflowVersion: "1.0.0",
  runId: crypto.randomUUID(),
});

// Result always includes actual identity used
result.value.workflowId; // step.name (defaulted) or explicit
result.value.workflowVersion; // "0.0.0" (defaulted) or explicit
result.value.runId; // generated or explicit
```

### Defaults

| Parameter         | Default               |
| ----------------- | --------------------- |
| `workflowId`      | `step.name`           |
| `workflowVersion` | `"0.0.0"`             |
| `runId`           | `crypto.randomUUID()` |

### Context Factory

`createContextFactory()` remains for advanced use cases (shared adapters, custom metadata). For simple cases, pass `adapters` directly.

### runStep for Advanced Use

`runStep()` remains available for advanced scenarios requiring custom context factories (e.g., `@verist/pipeline` sharing context across stages). It is not part of the primary onboarding path and should be considered internal/advanced API.

## Alternatives

- **Remove runStep entirely**: Rejected – needed by pipeline and custom orchestration.
- **Add `isDefaulted` flag to result**: Rejected – if you care about identity, pass it explicitly; if you didn't, you already know it was defaulted.

## Consequences

- **Positive**: Simpler API, easier onboarding, reduced docs
- **Negative**: Breaking change for `runStep()` users (migration: replace `runStep({...})` with `run(step, input, {...})`)
- **Follow-ups**: Update SPEC-overview, package READMEs

## References

- SPEC-overview
- packages/core/README.md
