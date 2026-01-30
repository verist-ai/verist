# SPEC: Replay

Deterministic replay and recomputation for Verist workflows.

## Concepts

**Artifact** — A captured non-deterministic value with its content hash. Artifacts store LLM responses, external API results, and other values that would vary between executions.

**Snapshot** — Point-in-time capture of step execution. Contains input, input hash, and all artifacts needed to replay the step.

**Replay** — Exact reproduction of past execution using stored artifacts. Output should be byte-identical to original.

**Recompute** — Fresh execution with current adapters. Produces diff showing what changed compared to original.

## Types

```typescript
interface Artifact {
  hash: string; // SHA-256 of content
  kind: "llm-input" | "llm-output" | "step-input" | "step-output" | string;
  content?: unknown; // Optional for compliance
}

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
// Hash any JSON-serializable value
const hash = hashValue({ name: "Alice", age: 30 });
// => "sha256:7d1a54..."

// Get both hash and serialized content
const { hash, content } = hashWithContent(value);
```

Hashes are deterministic: identical values produce identical hashes regardless of key order. Uses stable JSON serialization with sorted keys.

### Capturing Artifacts

```typescript
// Capture with content
const artifact = captureArtifact("llm-output", response);
// => { hash: "sha256:...", kind: "llm-output", content: response }

// Compliance mode: hash only
const artifact = captureArtifact("llm-output", response, { hashOnly: true });
// => { hash: "sha256:...", kind: "llm-output" }
```

### Creating Snapshots

```typescript
const snapshot = createSnapshot({
  workflowId: "verify-document",
  workflowVersion: "1.2.0",
  stepName: "extract",
  input: { documentId: "doc-123" },
  artifacts: [captureArtifact("llm-output", extractionResponse)],
});
```

### Diffing

```typescript
// Compare two values
const result = diff(before, after);
if (!result.equal) {
  console.log(formatDiff(result));
  // => "  age: 30 → 31"
}

// Apply diff to produce new value
const updated = applyDiff(base, result);
```

### Replay

```typescript
// Exact replay using stored artifacts
const { output, usedArtifacts } = await replay(snapshot, async (hash) => {
  return artifactStore.get(hash);
});
```

Replay requires a `step-output` artifact in the snapshot. Throws `ReplayError` with code `MISSING_OUTPUT` if not found.

### Recompute

```typescript
// Fresh execution with diff
const { output, diff } = await recompute(snapshot, extractStep, ctx);

if (!diff.equal) {
  console.log("Output changed:");
  console.log(formatDiff(diff));
}
```

Recompute verifies input hash matches before execution. Throws `RecomputeError` with code `INPUT_HASH_MISMATCH` if tampered.

### Comparing Snapshots

```typescript
// Compare across workflow versions
const { inputDiff, outputDiff } = compareSnapshots(v1Snapshot, v2Snapshot);
```

## Usage Patterns

### Capture During Execution

Wrap adapters to capture artifacts as they execute:

```typescript
function wrapLLM(llm, artifacts) {
  return {
    async complete(prompt) {
      const inputArtifact = captureArtifact("llm-input", prompt);
      artifacts.push(inputArtifact);

      const response = await llm.complete(prompt);

      const outputArtifact = captureArtifact("llm-output", response);
      artifacts.push(outputArtifact);

      return response;
    },
  };
}
```

### Store Artifacts Externally

The replay package produces artifacts but doesn't store them. Bring your own storage:

```typescript
// After step execution
for (const artifact of snapshot.artifacts) {
  await db.artifacts.insert({
    hash: artifact.hash,
    kind: artifact.kind,
    content: artifact.content,
    snapshotId: snapshot.id,
  });
}

// For replay
const getArtifact = async (hash) => {
  const row = await db.artifacts.findByHash(hash);
  return row?.content;
};
```

### Compliance Mode

When content cannot be stored, use hash-only artifacts:

```typescript
const artifact = captureArtifact("llm-output", response, { hashOnly: true });
// Content is not stored, only hash for audit correlation
```

Hash-only artifacts enable audit trails without persisting sensitive data. Replay with hash-only artifacts requires external content retrieval.

### Regression Testing

Compare outputs across model versions:

```typescript
// Capture baseline with GPT-4
const baselineSnapshot = await executeAndCapture(step, input, gpt4Ctx);

// Recompute with GPT-4-turbo
const { diff } = await recompute(baselineSnapshot, step, gpt4TurboCtx);

if (!diff.equal) {
  console.log("Model change affected output:");
  console.log(formatDiff(diff));
}
```

## Design Notes

1. **No storage in package** — Artifacts are produced/consumed; storage is external
2. **Compliance mode** — Hash-only artifacts for regulated environments
3. **Structural diff** — Compares JSON structure; semantic diff is out of scope
4. **Deterministic hashing** — Sorted keys ensure consistent hashes
