# ADR-008: Artifact Capture Hook in Core

## Status

Accepted

## Context

- **Problem**: Replay + diff is Verist's core differentiator, but enabling it requires manual adapter wrapping and separate `@verist/replay` integration. The friction to "first diff" is too high.
- **Why now**: Replay should be nearly zero-friction to match "fastest reason to try Verist today" positioning.
- **Constraints**: Kernel must stay minimal – replay semantics (snapshot structure, artifact precedence, hash-only mode) should not leak into core.

## Decision

- **Chosen option**: Add optional `onArtifact` callback to `run()` options
- **Rationale**:
  - Enables artifact capture without bloating kernel
  - Storage remains caller's responsibility (array, DB, S3)
  - `@verist/replay` stays separate but consumes artifacts cleanly

### API

```typescript
const artifacts: Artifact[] = [];

const result = await run(step, input, {
  adapters,
  onArtifact: (artifact) => artifacts.push(artifact),
});

// artifacts now contains step-output and any adapter-emitted artifacts
// Pass to @verist/replay for snapshot creation and recompute
```

### What Core Emits

Core automatically emits `step-output` artifact containing `{ delta, events }` when `onArtifact` is provided. The artifact includes a content hash computed via Web Crypto API, adding minimal per-step overhead.

### What Adapters Emit

Adapters (e.g., `@verist/llm`) emit their own artifacts (`llm-input`, `llm-output`) via the same callback. The callback is passed through context:

```typescript
// In adapter
if (ctx.onArtifact) {
  ctx.onArtifact(captureArtifact("llm-input", request));
}
```

### What Stays in Replay Helpers

- `createSnapshot()`, `createSnapshotFromResult()`
- `recompute()`, `diff()`, `formatDiff()`
- Artifact kind precedence rules
- Hash-only mode handling

## Alternatives

- **Merge replay into core**: Rejected – drags replay policy (artifact precedence, snapshot schema) into kernel, violates minimal surface area.
- **Auto-snapshot on result**: Rejected – pressures core to know replay semantics; unclear storage responsibility.

## Consequences

- **Positive**: Fast path to "first diff", kernel stays minimal, clean extension point
- **Negative**: Adapters need to check for callback (minor)
- **Follow-ups**: Update @verist/llm to emit artifacts via callback, add `withReplay()` helper to @verist/replay

## References

- SPEC-replay
- packages/replay/README.md
