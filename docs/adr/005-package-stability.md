# ADR-005: Package Stability Tiers

## Status

Accepted

## Context

- **Problem**: Users need to know which APIs are stable for production use vs. evolving
- **Why now**: The library is approaching public release; stability expectations must be explicit
- **Constraints**: Two packages exist (`@verist/core`, `@verist/replay`) with different evolution rates

## Decision

- **Chosen option**: Define two stability tiers with explicit guarantees

### Tier 1: Kernel (`@verist/core`)

Stability promise:

- Breaking changes require major version bump
- API surface kept minimal — new exports are additions, not replacements
- Deprecated APIs supported for at least one major version

Core exports with stability guarantee:

- `defineStep`, `defineWorkflow`, `runStep`
- `createContextFactory`
- `Result` type and helpers (`ok`, `err`, `isOk`, `isErr`, `map`, `flatMap`)
- Command types and builders (`invoke`, `fanout`, `review`, `emit`)
- `AuditEvent`, `LLMTrace` schemas

### Tier 2: Capabilities (`@verist/replay`)

Stability promise:

- May evolve faster than kernel
- Breaking changes documented in changelog
- Semantic versioning applies, but expect more minor version bumps

Reason: Replay, diff, and recomputation patterns are newer and may need iteration as real-world usage reveals edge cases.

## Alternatives

- **Single stability tier**: Rejected — forces either too-slow core evolution or too-unstable guarantees
- **No explicit tiers**: Rejected — users cannot make informed dependency decisions

## Consequences

- **Positive**: Users can depend on kernel stability for compliance/audit use cases
- **Positive**: Replay package can iterate based on real-world feedback
- **Negative**: Must maintain discipline when adding to kernel
- **Follow-ups**: Consider `@verist/trust-kit` as Tier 2 when implemented

## References

- SPEC-kernel-invariants.md — defines what the kernel guarantees
- vision.md — "Trust Kit (optional layer)" suggests tiered stability
