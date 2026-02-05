# ADR-011: Consolidate core + replay into single `verist` package

## Status

Accepted

## Context

- **Problem**: `@verist/core` and `@verist/replay` were separate packages, but replay depends entirely on core types and is always used together. Consumers had to install and import from two packages for basic workflows.
- **Why now**: Several packages (`@verist/batch`, `@verist/pipeline`, `@verist/queue`, `@verist/otel`, `@verist/artifacts`) were speculative and unused. Consolidating now reduces maintenance surface before the first stable release.
- **Constraints**: The merged package must export everything both packages previously exported so dependent packages (`@verist/llm`, `@verist/storage`, `@verist/storage-pg`, `@verist/cli`) compile with only import path changes.

## Decision

- **Chosen option**: Merge `@verist/core` and `@verist/replay` into a single `verist` package. Delete unused packages.
- **Rationale**:
  - Single import for the primary API (`import { defineStep, recompute, diff } from "verist"`)
  - Eliminates circular dependency risk between core and replay
  - Removes 5 speculative packages that added maintenance cost with no consumers

## Alternatives

- **Keep separate packages**: Higher install/import friction, split API surface for tightly coupled functionality.
- **Merge into `@verist/core`**: Keeps scoped name but loses the cleaner `verist` top-level import.

## Consequences

- **Positive**: Single dependency for most consumers; simpler workspace; fewer packages to version/publish.
- **Negative**: Larger single package (though tree-shaking mitigates bundle size).
- **Follow-ups**: Update sandbox project and docs to use `verist` imports. Re-introduce queue/pipeline packages only when there are real consumers.

## References

- ADR-005: Package stability tiers (superseded for deleted packages)
