# ADR-004: Replay Semantics

## Status

Accepted

## Context

- **Problem**: Steps call LLMs and external services that produce non-deterministic outputs. We need to reproduce past executions exactly for debugging, compliance, and regression testing.
- **Why now**: Audit requirements demand proof that behavior can be reconstructed; testing needs deterministic fixtures.
- **Constraints**: Cannot require all content to be stored (compliance may forbid it); must support both exact replay and fresh recomputation.

## Decision

- **Chosen option**: Artifact-based replay with separate recompute path
- **Rationale**:
  - Artifacts capture non-deterministic inputs (LLM responses) by content hash
  - Replay uses stored artifacts to reproduce exact output
  - Recompute uses fresh calls and diffs against original
  - Hash-only mode enables compliance without storing sensitive content

## Alternatives

- **Event sourcing**: Replay by re-applying all events. Rejected – events are outputs not inputs; doesn't capture LLM responses
- **Mocked adapters**: Replace adapters with recorded responses. Rejected – tightly couples to adapter implementation; complex setup
- **Snapshot entire state**: Store full state at each step. Rejected – doesn't enable re-execution; storage overhead for unchanged fields

## Consequences

- **Positive**: Exact replay for debugging; fresh recompute reveals model drift; hash-only mode for compliance
- **Negative**: Step authors must ensure artifact capture at non-deterministic points; storage required for artifact content
- **Follow-ups**: Define adapter wrapping patterns for automatic capture; document compliance mode configuration

## References

- SPEC-replay
- SPEC-kernel-invariants (Invariant 6: Replay Is Exact)
