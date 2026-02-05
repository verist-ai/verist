# ADR-009: Pipeline Error Handling and Audit Trail

## Status

Accepted

## Context

- **Problem**: Pipeline `onError: "skip"` has an audit gap – skipped stages emit no events, violating "nothing important is lost" principle. The name "skip" also implies hiding rather than explicit continuation.
- **Why now**: Audit-first is a kernel invariant; pipelines should maintain the evidence trail.
- **Constraints**: Feature is genuinely useful for optional enrichment stages; removal would force boilerplate try/catch in every step.

## Decision

- **Chosen option**: Rename `"skip"` to `"continue"`, pipeline runner emits audit event on continuation
- **Rationale**:
  - `"continue"` better expresses intent (error acknowledged, proceeding)
  - Pipeline-owned audit event closes the evidence gap
  - Keeps feature without violating audit-first principle

### Renamed Option

```typescript
interface PipelineStageConfig {
  step: Step<any, any, any>;
  wire?: (prevOutput: unknown, pipelineInput: unknown) => unknown;
  onError?: "fail" | "continue"; // renamed from "skip"
}
```

### Pipeline-Owned Audit Event

When a stage fails and `onError: "continue"` is set, pipeline runner emits:

```typescript
{
  type: "pipeline.stage_error",  // namespaced to distinguish from step events
  payload: {
    stepName: string;
    code: string;
    message: string;
  }
}
```

This event is included in `PipelineResult.stages[n].events` for the continued stage, maintaining the audit trail. The `pipeline.` prefix distinguishes pipeline-owned events from step-emitted events.

### StageResult Changes

```typescript
interface StageResult {
  stepName: string;
  status: "completed" | "failed" | "continued" | "suspended"; // "skipped" → "continued"
  // ...
}
```

## Alternatives

- **Remove feature entirely**: Rejected – forces try/catch boilerplate into every "optional" step, scattering error policy.
- **Keep "skip" naming**: Rejected – sounds like hiding; "continue" is more honest.
- **Emit event from step**: Rejected – step didn't run to completion, can't emit events; pipeline must own this.

## Consequences

- **Positive**: Audit trail complete, naming clearer, feature preserved
- **Negative**: Breaking change for `onError: "skip"` users (migration: rename to `"continue"`)
- **Follow-ups**: Update SPEC-pipeline, packages/pipeline/README.md

## References

- SPEC-pipeline
- SPEC-kernel-invariants (Events Are Immutable)
