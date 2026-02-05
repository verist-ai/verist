# SPEC: Replay

Deterministic replay and recomputation for Verist workflows.

## Concepts

**Artifact** – A captured non-deterministic value with its content hash.

**Snapshot** – Point-in-time capture of step execution with all artifacts needed to replay.

**Replay** – Exact reproduction of past execution using stored artifacts; output is byte-identical.

**Recompute** – Fresh execution with current adapters; produces diffs vs. the original snapshot.

## Types

```typescript
interface Artifact {
  hash: string; // SHA-256 of content
  kind: ArtifactKind;
  content?: unknown; // Optional for compliance
}

// Reserved kinds (kernel-defined)
// - "step-output": step's output + events, used by replay/recompute
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

## Artifact Capture

### Core Integration

The `run()` function accepts an optional `onArtifact` callback for artifact capture:

```typescript
const artifacts: Artifact[] = [];

const result = await run(step, input, {
  adapters,
  onArtifact: (artifact) => artifacts.push(artifact),
});

// artifacts now contains step-output and any adapter-emitted artifacts
```

When `onArtifact` is provided, core automatically emits a `step-output` artifact containing `{ output, events }`.

### Adapter Integration

Adapters emit their own artifacts via the callback passed through context:

```typescript
// In LLM adapter
if (ctx.onArtifact) {
  ctx.onArtifact(captureArtifact("llm-input", request));
  // ... execute LLM call ...
  ctx.onArtifact(captureArtifact("llm-output", response));
}
```

### withReplay Helper

A convenience wrapper captures artifacts and creates a snapshot in one call:

```typescript
const { result, artifacts } = await withReplay(step, input, { adapters });
const snapshot = createSnapshot({ ...result.value, artifacts });
```

## API

### Hashing

```typescript
const hash = await hashValue(value);
const { hash, content } = await hashWithContent(value);
```

Hashes are deterministic: identical values produce identical hashes regardless of key order. Uses Web Crypto API (async) for cross-platform support.

**Serialization semantics:** `undefined` values follow JSON behavior – top-level `undefined` becomes `null`; object properties with `undefined` are omitted; `undefined` in arrays becomes `null`.

### Capturing Artifacts

```typescript
const artifact = await captureArtifact("llm-output", response);
const hashOnly = await captureArtifact("llm-output", response, {
  hashOnly: true,
});
```

### Creating Snapshots

```typescript
const snapshot = await createSnapshot({
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

### Loading Output

```typescript
const result = await loadOutput(snapshot);
if (result.ok) {
  console.log(result.value);
}
```

Loading output requires a `step-output` artifact with content. Hash-only artifacts cannot be loaded.

### Recompute

```typescript
const result = await recompute(snapshot, step, ctx, {
  validate: true,
  strictOutput: true,
});
```

Options:

| Option             | Default | Description                                                                         |
| ------------------ | ------- | ----------------------------------------------------------------------------------- |
| `validate`         | `true`  | Enable schema validation (input: strict gate, output: observational)                |
| `strictOutput`     | `false` | Validate output against full `outputSchema` instead of partial. Requires `validate` |
| `captureArtifacts` | `false` | Capture output artifact (`true` for full content, or `CaptureOptions`)              |

Recompute verifies the input hash before execution. If it does not match, returns `err()` with code `input_hash_mismatch`.

### Comparing Snapshots

```typescript
const { inputDiff, outputDiff, commandsDiff } = compareSnapshots(a, b);
```

## Semantics

- **Replay** must be byte-identical to the original output when artifacts are available.
- **Recompute** compares current output and commands to the original snapshot.
- **Snapshot integrity**: A snapshot is valid iff `step-output` was produced from the same `inputHash` recorded in the snapshot.
- **Command diffs** are first-class: control-flow changes are reviewable. `createSnapshotFromResult()` auto-captures commands as a `step-commands` artifact when present. Use `captureCommands: false` to suppress.
- **Emission order**: Core emits `step-output` after step execution completes (after any adapter artifacts emitted during the run). Core awaits artifact hashing before invoking `onArtifact`; callbacks are invoked sequentially in emission order. When multiple artifacts share a kind, the first emitted takes precedence.
- **Core emits `step-output` only**: The `step-commands` artifact is optionally emitted by replay helpers (e.g., `withReplay`). If neither artifact exists, command diffing returns `undefined`.
- **Command capture is automatic**: `createSnapshotFromResult()` emits `step-commands` whenever commands are present. Suppress with `captureCommands: false`. If neither artifact exists, `commandsDiff` falls back to commands embedded in `step-output` (if present) or returns `undefined`.
- **Artifact precedence**: when both `step-commands` and `step-output` contain commands, `step-commands` is authoritative.
- **Hash-only limits diffing**: if `commandsHashOnly: true` is used and no other source provides command content, `commandsDiff` will be `undefined`.
