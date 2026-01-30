# @verist/replay

Deterministic replay and recomputation for Verist workflows.

## Installation

```bash
npm install @verist/replay
```

## Usage

```typescript
import {
  hashValue,
  captureArtifact,
  createSnapshot,
  replay,
  recompute,
  diff,
} from "@verist/replay";

// Capture artifacts during step execution
const artifact = captureArtifact("llm-output", response);

// Create a replayable snapshot
const snapshot = createSnapshot({
  workflowId: "verify-doc",
  workflowVersion: "1.0.0",
  stepName: "extract",
  input: { documentId: "doc-123" },
  artifacts: [artifact],
});

// Exact replay using stored artifacts
const result = await replay(snapshot, (hash) => artifactStore.get(hash));

// Fresh recomputation with diff
const { output, diff: changes } = await recompute(snapshot, step, ctx);
```

## API

### Hashing

- `hashValue(value)` — SHA-256 hash of JSON-serializable value

### Artifacts

- `captureArtifact(kind, content, opts?)` — Create artifact with hash
- `createSnapshot(params)` — Create replayable snapshot

### Diff

- `diff(before, after)` — Generate structural diff
- `applyDiff(base, diff)` — Apply diff to produce new value
- `formatDiff(diff)` — Human-readable diff output

### Replay

- `replay(snapshot, getArtifact)` — Exact replay using stored artifacts
- `recompute(snapshot, step, ctx)` — Fresh execution with diff

## Design

This package produces and consumes artifacts but does not store them. Storage is external—bring your own database, S3, or content-addressable store.

See [SPEC-replay](../../docs/specs/replay.md) for detailed documentation.
