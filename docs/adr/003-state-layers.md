# ADR-003: State Layers

## Status

Accepted

## Context

- **Problem**: AI-derived state must be recomputable without losing human corrections
- **Why now**: Users need to correct AI mistakes while preserving the ability to reprocess with new models
- **Constraints**: Recomputation must be safe and predictable; human decisions are authoritative

## Decision

- **Chosen option**: Three-layer state model with computed, overlay, and effective views
- **Rationale**:
  - Computed layer holds AI-derived values, safely rewritable on reprocessing
  - Overlay layer holds human corrections, never touched by recomputation
  - Effective layer is computed as `{ ...computed, ...overlay }` – overlay values take precedence
  - Computed and overlay are the only persisted sources of truth; effective is a derived view and MUST NOT be persisted
  - Overlay is authoritative per field and replaces computed values entirely (no implicit deep-merge)
  - Overlay represents human-authoritative decisions and MUST NOT be written by automated steps
- **Merge semantics clarification**:
  - Effective state uses shallow spread: `{ ...computed, ...overlay }`
  - If overlay contains an explicit key (even with value `undefined`), that key overrides computed
  - This means `overlay: { score: undefined }` will result in `effective.score === undefined`, not `computed.score`
  - Avoid storing `undefined` in overlay; use key deletion or tombstone values instead

## Alternatives

- **Single mutable state**: Human edits and AI outputs mixed. Rejected – recomputation would destroy corrections
- **Version branches**: Fork state on each edit. Rejected – complex merge logic, storage overhead
- **Immutable snapshots only**: No in-place corrections. Rejected – poor UX for human reviewers

## Consequences

- **Positive**: Safe recomputation; human decisions preserved; clear data lineage
- **Negative**: Increased write-path complexity; read-path requires composition of layers
- **Follow-ups**:
  - Define storage schema patterns
  - Invariant evaluation phase (computed vs effective) must be explicit
  - Overlay values MUST be validated against the current state schema; invalid entries are surfaced as conflicts or quarantined, never silently dropped
  - Any deep-merge semantics must be explicit and opt-in outside the kernel

## References

- SPEC-overview (State Management section)
