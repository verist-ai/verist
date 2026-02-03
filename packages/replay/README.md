# @verist/replay

[![npm version](https://badge.fury.io/js/@verist%2Freplay.svg)](https://badge.fury.io/js/@verist%2Freplay)
[![npm downloads](https://img.shields.io/npm/dm/@verist/replay.svg)](https://npmjs.com/package/@verist/replay)
[![Ask ChatGPT](https://img.shields.io/badge/Ask_ChatGPT-10a37f?logo=google+gemini&logoColor=white)](https://chatgpt.com/g/g-697e23b923088191b8cb315bebf14a3b-verist-architect)
[![Twitter Follow](https://img.shields.io/twitter/follow/verist_ai?style=social)](https://x.com/verist_ai)

Deterministic replay and recomputation for Verist workflows.

## Installation

```bash
npm install @verist/replay
```

## Usage

### Creating Snapshots

Use `createSnapshotFromResult` after step execution:

```typescript
import { runStep, createContextFactory } from "@verist/core";
import {
  createSnapshotFromResult,
  recompute,
  formatDiff,
} from "@verist/replay";

const result = await runStep({
  step,
  input,
  contextFactory: createContextFactory(adapters),
  workflowId: "verify-doc",
  workflowVersion: "1.0.0",
  runId: crypto.randomUUID(),
});

if (result.ok) {
  // Create snapshot for later replay/recompute
  const snapshot = await createSnapshotFromResult(result.value, {
    captureCommands: true, // Required for command diffing
  });

  // Store snapshot for later use
  await artifactStore.save(snapshot);
}
```

### Recomputing with Diff

Later, recompute with a fresh execution and compare:

```typescript
import { recompute, formatDiff } from "@verist/replay";

const recomputed = await recompute(snapshot, step, ctx);

if (recomputed.ok) {
  const { deltaDiff, commandsDiff } = recomputed.value;

  if (deltaDiff && !deltaDiff.equal) {
    console.log("State changed:", formatDiff(deltaDiff));
  }
  if (commandsDiff && !commandsDiff.equal) {
    console.log("Control flow changed:", formatDiff(commandsDiff));
  }
}
```

### Loading Stored Output

Load historical results without re-execution:

```typescript
import { loadOutput } from "@verist/replay";

const output = await loadOutput(snapshot);
if (output.ok) {
  console.log(output.value.delta);
}
```

## API

### Hashing

- `hashValue(value)` — SHA-256 hash of JSON-serializable value (re-exported from `@verist/core`)
- `hashWithContent(value)` — Returns both hash and serialized content (async)

### Artifacts

- `captureArtifact(kind, content, opts?)` — Create artifact with hash (async)
- `createSnapshot(params)` — Create snapshot from raw params (async)
- `createSnapshotFromResult(result, opts?)` — Create snapshot from step result (async)

### Diff

- `diff(before, after)` — Generate structural diff
- `applyDiff(base, diff)` — Apply diff to produce new value
- `formatDiff(diff)` — Human-readable diff output
- `diffEffectiveState(before, after)` — Diff layered states by effective view

### Replay

- `loadOutput(snapshot)` — Load stored output from snapshot (async)
- `recompute(snapshot, step, ctx)` — Fresh execution with diff (async)
- `compareSnapshots(original, updated)` — Compare two snapshots

## Design

This package produces and consumes artifacts but does not store them. Storage is external — bring your own database, S3, or content-addressable store.

The `onArtifact` callback in `@verist/core` is the primary integration point. This package provides utilities to consume those artifacts for snapshot creation and recomputation.

See [SPEC-replay](../../docs/specs/replay.md) for detailed documentation.
