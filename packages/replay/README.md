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

```typescript
import {
  captureArtifact,
  createSnapshotFromResult,
  loadOutput,
  recompute,
  diff,
  formatDiff,
} from "@verist/replay";

// Create snapshot from step result (preferred)
const snapshot = createSnapshotFromResult(result);

// Load stored output without re-execution
const output = loadOutput(snapshot);

// Fresh recomputation with diff
const recomputed = await recompute(snapshot, step, ctx);
if (recomputed.ok && recomputed.value.diff && !recomputed.value.diff.equal) {
  console.log(formatDiff(recomputed.value.diff));
}
```

## API

### Hashing

- `hashValue(value)` — SHA-256 hash of JSON-serializable value
- `hashWithContent(value)` — Returns both hash and serialized content

### Artifacts

- `captureArtifact(kind, content, opts?)` — Create artifact with hash
- `createSnapshot(params)` — Create snapshot from raw params
- `createSnapshotFromResult(result, opts?)` — Create snapshot from step result

### Diff

- `diff(before, after)` — Generate structural diff
- `applyDiff(base, diff)` — Apply diff to produce new value
- `formatDiff(diff)` — Human-readable diff output
- `diffEffectiveState(before, after)` — Diff layered states by effective view

### Replay

- `loadOutput(snapshot)` — Load stored output from snapshot
- `recompute(snapshot, step, ctx)` — Fresh execution with diff
- `compareSnapshots(original, updated)` — Compare two snapshots

## Design

This package produces and consumes artifacts but does not store them. Storage is external—bring your own database, S3, or content-addressable store.

See [SPEC-replay](../../docs/specs/replay.md) for detailed documentation.
