# SPEC: Overview

## Concepts

**Workflow** – Named sequence of steps with typed state.

**Step** – Pure function: `(input, context) => { delta, events, commands? }`. Atomic, idempotent. May call LLMs. Commands express routing declaratively.

**State** – Domain data persisted between steps. Source of truth is database.

**Event** – Audit record emitted by steps. Immutable log of what happened and why.

**Context** – Runtime dependencies (db, llm, queue) injected into steps.

## Flow

```
Queue message → Load state → Run step → Persist delta + events → Emit next message
```

Steps don't know about queues. Orchestration is external.
The kernel is compatible with short-lived, stateless execution environments (edge/serverless) by design.

## Kernel Invariants

### Step Invariants

Steps are the atomic unit of the kernel. These rules are non-negotiable:

- **Idempotent**: Same input + state → same output. Safe to retry.
- **Pure**: No global mutable state. All dependencies injected via context.
- **Explicit effects**: Side effects expressed only via events and commands.
- **Replay-safe**: Replayable given only recorded input, state, and artifacts.
- **Self-contained**: No implicit dependencies on execution order or external state.

Any value that influences a step's output must be input, state, or artifact-addressable.

### Serialization Contract

Kernel serialization (`stableStringify`, `hashValue`) follows JSON semantics for `undefined` normalization. This applies to all hashing and artifact identity in Verist:

- Top-level `undefined` becomes `null`
- Object properties with `undefined` values are omitted
- `undefined` in arrays becomes `null`

This ensures deterministic hashing regardless of how values were constructed.

## API Sketch

```typescript
const workflow = defineWorkflow({
  name: "verify-document",
  version: "1.0.0", // required for audit
  steps: { extract, verify, score },
});

const step = defineStep({
  name: "extract",
  input: z.object({ documentId: z.string() }),
  delta: z.object({ claims: z.array(ClaimSchema) }),
  run: async (input, ctx) => {
    const doc = await ctx.adapters.db.getDocument(input.documentId);
    const claims = await ctx.adapters.llm.extract(doc.content);
    return {
      delta: { claims },
      events: [{ type: "claims_extracted", payload: { count: claims.length } }],
      // Type-safe: workflow.invoke infers input type from step schema
      commands: [workflow.invoke("verify", { claims })],
    };
  },
});
```

## Commands

Steps return optional commands to express "what should happen next" declaratively:

```typescript
type Command =
  | { type: "invoke"; step: string; input: unknown } // request next step
  | { type: "fanout"; step: string; inputs: unknown[] } // parallel processing
  | { type: "review"; reason: string; payload?: unknown } // human-in-the-loop
  | { type: "emit"; topic: string; payload: unknown } // external event
  | {
      type: "suspend";
      reason: string;
      checkpoint: unknown;
      resumeStep?: string;
    }; // await external input
```

Commands are data, not execution. The external runner interprets them.

### Command Semantics

- **invoke / fanout**: Dispatch commands. These direct execution to other steps. `fanout` inputs are logically independent; each input represents an isolated step execution. Runners may batch or parallelize, but must not share mutable state between executions.

- **review**: Blocking command. Workflow progression must stop until an external decision is provided. How the decision is captured and how execution resumes are runner concerns.

- **suspend**: Blocking command. Pauses workflow until external data arrives. Unlike review (human approval), suspend awaits data/callbacks. Sibling commands are discarded; the resumed step emits new commands. See SPEC-suspend.

- **emit**: Side-effect command for external systems. Distinct from audit events; not part of the internal evidence log.

## Audit Event Structure

```typescript
// Core emits minimal events; orchestrator adds id, timestamp, workflowId, stepName
interface AuditEvent {
  type: string;
  payload?: Record<string, unknown>;
  llmTrace?: LLMTrace;
}

interface LLMTrace {
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  inputHash: string; // always present for audit correlation
  outputHash: string; // always present for deduplication
  input?: unknown; // optional - can be omitted for compliance
  output?: unknown; // optional - can be omitted for compliance
}
```

## State Management

- **Computed**: AI-derived, rewritten on recompute
- **Overlay**: Human overrides, never touched by recomputation
- **Effective**: `{ ...computed, ...overlay }` – overlay keys take precedence

Recomputation never modifies human decisions. See ADR-003 for merge semantics.

## Execution Contract

After calling `run()`, the caller **must** complete the following to honor the kernel's guarantees. Below, `stepResult` refers to the unwrapped `StepResult` (i.e., `result.value` when `result.ok === true`).

1. **Persist the delta** – Merge `stepResult.output.delta` into storage (computed layer). Without this, state is lost.

2. **Record events** – Write `stepResult.output.events` to your audit log. Events are the evidence trail.

3. **Enqueue commands** – If `stepResult.output.commands` is non-empty, translate each command to your queue/orchestration system.

```typescript
const result = await run(step, input, {
  adapters,
  workflowId: "verify-document",
  workflowVersion: "1.0.0",
  runId: crypto.randomUUID(),
});

if (result.ok) {
  // 1. Persist delta
  await store.commit({
    workflowId: result.value.workflowId,
    runId: result.value.runId,
    stepId: result.value.stepName,
    expectedVersion: currentVersion,
    delta: result.value.output.delta,
    events: result.value.output.events,
  });

  // 2. Enqueue commands
  for (const cmd of result.value.output.commands ?? []) {
    await queue.enqueue(cmd);
  }
}
```

**Verist guarantees correctness if and only if this contract is honored.**

Skipping any step breaks invariants:

- Skipping persistence → state drift, failed replays
- Skipping events → incomplete audit trail
- Skipping commands → workflow stalls

## Kernel Boundaries

Verist is a kernel, not a platform. The following are explicitly external:

**Orchestration**: The kernel produces commands; external runners execute them. Verist does not manage queues, workers, or retry policies.

**Approval workflows**: When a step returns a `review` command, the kernel's job is done. Approval UIs, escalation logic, and persistence of approvals are external.

**Diff review and persistence**: `recompute()` produces a diff. The decision to accept, reject, or modify that diff – and persist the outcome – is external.

The kernel's contract ends at: `(input, artifacts) → (delta, events, commands)`.

**Runner constraints**: External orchestrators must treat steps as pure black boxes:

- Must not mutate state directly
- Must not interpret step output beyond commands
- Must not inject implicit retries or branching logic
- Must not add behavior not expressed in commands

**Runtime assumptions**: Runners may be short-lived and stateless. Steps must not depend on:

- In-memory durable state across executions
- Background loops or long-lived workers
- Local filesystem for persistence

**Layer boundaries**: Higher-level packages consume only the kernel's public outputs – audit events and state deltas – never raw internal state. This ensures the kernel remains universal and extensions are purely additive.

## Future: Trust Kit

The Trust Kit is a planned Tier 2 capability package (`@verist/trust`) that will provide opt-in primitives for high-trust workflows:

- Evidence tiers and verdict types
- Contradiction detection and review escalation
- Computed/overlay helpers with conflict surfacing
- Immutable snapshot builders

The kernel (`@verist/core`) remains universal; Trust Kit adds domain-specific trust primitives.
