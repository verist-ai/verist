# SPEC: Replay

Deterministic replay and recomputation for Verist workflows.

## Concepts

**Artifact** — A captured non-deterministic value with its content hash.

**Snapshot** — Point-in-time capture of step execution with all artifacts needed to replay.

**Replay** — Exact reproduction of past execution using stored artifacts; output is byte-identical.

**Recompute** — Fresh execution with current adapters; produces diffs vs. the original snapshot.

## Types

```typescript
interface Artifact {
  hash: string; // SHA-256 of content
  kind: ArtifactKind;
  content?: unknown; // Optional for compliance
}

// Reserved kinds (kernel-defined)
// - "step-output": step's delta + events, used by replay/recompute
// - "step-commands": step's commands, used by recompute command diffing
// User-defined kinds (e.g., "llm-input", "llm-output") are opaque metadata
type ArtifactKind = "step-output" | "step-commands" | (string & {});

interface Snapshot {
  workflowId: string;
  workflowVersion: string;
  stepName: string;
  input: unknown;
  inputHash: string;
  artifacts: Artifact[];
  capturedAt: number; // Unix timestamp (ms)
}

interface DiffResult {
  equal: boolean;
  entries: DiffEntry[];
}

interface DiffEntry {
  path: (string | number)[];
  before: unknown;
  after: unknown;
}
```

## API

### Hashing

```typescript
const hash = hashValue(value);
const { hash, content } = hashWithContent(value);
```

Hashes are deterministic: identical values produce identical hashes regardless of key order.

### Capturing Artifacts

```typescript
const artifact = captureArtifact("llm-output", response);
const hashOnly = captureArtifact("llm-output", response, { hashOnly: true });
```

### Creating Snapshots

```typescript
const snapshot = createSnapshot({
  workflowId,
  workflowVersion,
  stepName,
  input,
  artifacts,
});
```

### Diffing

```typescript
const result = diff(before, after);
const updated = applyDiff(base, result);
```

### Replay

```typescript
const { output, usedArtifacts } = await replay(snapshot, async (hash) => {
  return artifactStore.get(hash);
});
```

Replay requires a `step-output` artifact. If missing, throw `ReplayError` with code `MISSING_OUTPUT`.

### Recompute

```typescript
const { output, deltaDiff, commandsDiff } = await recompute(
  snapshot,
  step,
  ctx,
);
```

Recompute verifies the input hash before execution. If it does not match, throw `RecomputeError` with code `INPUT_HASH_MISMATCH`.

### Comparing Snapshots

```typescript
const { inputDiff, deltaDiff, commandsDiff } = compareSnapshots(a, b);
```

## Semantics

- **Replay** must be byte-identical to the original output when artifacts are available.
- **Recompute** compares current output and commands to the original snapshot.
- **Command diffs** are first-class: control-flow changes are reviewable.
- **First artifact wins**: if multiple artifacts of the same kind exist, the first is authoritative.
- **Command capture is opt-in**: use `captureCommands: true` in `createSnapshotFromResult()` for full command diffing. Without explicit capture, `commandsDiff` falls back to commands embedded in `step-output` (if present) or returns `undefined`.
- **Artifact precedence**: when both `step-commands` and `step-output` contain commands, `step-commands` is authoritative.
- **Hash-only limits diffing**: if `commandsHashOnly: true` is used and no other source provides command content, `commandsDiff` will be `undefined`.
