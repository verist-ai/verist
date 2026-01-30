# SPEC: Kernel Invariants

Ten guarantees that Verist maintains at all times. Code that violates these invariants is incorrect.

These invariants are part of the **Tier 1 (Kernel)** stability guarantee (see ADR-005).

## 1. Steps Are Pure

Given identical inputs and artifact playback, a step produces identical outputs. Side effects (database writes, API calls) happen through adapters, not directly.

```typescript
// Pure: depends only on input and injected adapters
run: async (input, ctx) => {
  const data = await ctx.adapters.db.get(input.id);
  return { delta: { data }, events: [] };
};
```

## 2. State Lives in Database

In-memory state is ephemeral. The database is the source of truth. Queue jobs are pointers, not payloads—they identify what to execute, not the data to process.

```typescript
// Job is a pointer (no payload field)
const job: Job = {
  id: "job-1",
  workflowId: "wf-123",
  workflowVersion: "1.0.0",
  runId: "run-456",
  stepId: "extract",
};

// Handler loads state from database
const handler: JobHandler = async (job) => {
  const state = await stateStore.load(job.workflowId, job.runId);
  // ...
};
```

## 3. Commands Are Data

Steps return commands as plain objects describing intent. Commands are not executed by the kernel—external orchestrators interpret them.

```typescript
// Command is data, not execution
return {
  delta: { processed: true },
  events: [],
  commands: [invoke("nextStep", { id: input.id })],
};
```

## 4. Deltas Are Partial

Steps return partial state updates, not full state. Only changed fields appear in the delta. The orchestrator merges deltas into persisted state.

```typescript
// Returns only changed fields
return {
  delta: { score: 0.95 }, // other fields unchanged
  events: [],
};
```

## 5. Events Are Immutable

Once emitted, audit events are never modified or deleted. Events form an append-only log of system behavior.

```typescript
// Events are write-once
events: [
  { type: "claim_verified", payload: { claimId: "c-1", result: "valid" } },
];
```

## 6. Replay Is Exact

Given a snapshot with captured artifacts, replay produces byte-identical output. Artifacts capture non-deterministic inputs (LLM responses, timestamps, random values).

```typescript
// Replay uses stored artifacts instead of live calls
const result = await replay(snapshot, (hash) => artifactStore.get(hash));
expect(hashValue(result)).toBe(snapshot.outputHash);
```

## 7. Overlay Wins

When computing effective state, human corrections (overlay) take precedence over AI-derived values (computed). Use `effectiveState()` to merge layers.

```typescript
import { effectiveState, type LayeredState } from "@verist/storage";

const state: LayeredState<{ confidence: number }> = {
  computed: { confidence: 0.6 },
  overlay: { confidence: 0.9 }, // human override
};

effectiveState(state); // { confidence: 0.9 } — overlay wins
```

## 8. Hashes Are Mandatory

Every LLM interaction records input and output hashes. Hashes enable deduplication, cache hits, and audit correlation without storing full content.

```typescript
// LLMTrace always includes hashes
llmTrace: {
  model: "gpt-4",
  inputHash: "sha256:abc123...",
  outputHash: "sha256:def456...",
  // input/output content optional for compliance
}
```

## 9. Errors Are Values

Expected failures return `Result` types, not thrown exceptions. Thrown exceptions indicate bugs, not business logic failures. This applies to `runStep`, `replay`, and `recompute`.

```typescript
// Error as value
const result = await runStep({ step, input, ... });
if (!result.ok) {
  // Handle expected failure
  log.warn("Step failed", { code: result.error.code });
}

// Same for replay/recompute
const replayResult = await replay(snapshot, getArtifact);
if (!replayResult.ok) {
  log.warn("Replay failed", { code: replayResult.error.code });
}

// Exception = bug
throw new Error("unreachable"); // should never happen
```

## 10. Version Is Auditable

Every step execution records the workflow version. Version is required in `runStep` params, flows through context, and appears in `StepResult`. Version changes are tracked so behavior differences can be attributed to code changes.

```typescript
// runStep requires version
const result = await runStep({
  step,
  input,
  contextFactory,
  workflowId: "verify-document",
  workflowVersion: "1.2.0",
  runId: "run-123",
});

// StepResult includes version
if (result.ok) {
  console.log(result.value.workflowVersion); // "1.2.0"
}
```

## Summary Table

| #   | Invariant            | Violated By                              |
| --- | -------------------- | ---------------------------------------- |
| 1   | Steps are pure       | Direct I/O in step body                  |
| 2   | State in database    | In-memory caching without sync           |
| 3   | Commands are data    | Executing commands in kernel             |
| 4   | Deltas are partial   | Returning full state objects             |
| 5   | Events are immutable | Updating past events                     |
| 6   | Replay is exact      | Non-determinism without artifact capture |
| 7   | Overlay wins         | Overwriting human corrections            |
| 8   | Hashes mandatory     | LLM calls without hash logging           |
| 9   | Errors are values    | Throwing for expected failures           |
| 10  | Version auditable    | Omitting workflowVersion from runStep    |
