# SPEC: Suspend/Resume

Long-running workflows that pause for external input and resume when ready.

## Problem

Some workflows cannot complete in a single execution:

- Verification requires founder to upload documentation
- Approval needs human review with unbounded latency
- External system callback hasn't arrived yet

These workflows must **suspend** (persist state and exit) then **resume** (continue from where they left off) when the blocking condition resolves.

## Concepts

**Suspension** – A workflow pause with serialized state. The step signals it cannot proceed, and the runner persists enough context to resume later.

**Suspension Reason** – Why the workflow paused. Enables routing: `awaiting_input` goes to founder UI, `awaiting_callback` waits for webhook.

**Resume Trigger** – External event that unblocks the workflow: founder uploads document, webhook arrives, timeout expires.

**Checkpoint** – Serialized state captured at suspension time. Immutable – resume adds new data alongside it.

## Design Principles

1. **Suspend is a command** – Follows existing command pattern (data, not action)
2. **Checkpoint is immutable** – Resume doesn't mutate suspension record
3. **Resume is a new step execution** – Not "continuing" old execution
4. **State in database** – Suspension records live in DB, not memory/KV
5. **Sibling commands are discarded** – Resumed step emits new commands

## Types

```typescript
interface SuspendCommand {
  type: "suspend";
  reason: string;
  checkpoint: unknown; // Serialized state for resume. MUST be JSON-serializable.
  resumeStep?: string; // Step to invoke on resume (defaults to current step)
}

interface SuspensionRecord {
  id: string;
  workflowId: string;
  workflowVersion: string; // Version that produced this suspension
  runId: string;
  stepName: string;
  reason: string;
  checkpoint: unknown; // Immutable, set at suspend time
  resumeStep: string; // Step to invoke on resume
  resumeData?: unknown; // Set once at resume time
  suspendedAt: Date;
  resumedAt?: Date;
}

interface ResumePayload {
  checkpoint: unknown; // From suspension
  resumeData: unknown; // New data triggering resume
}
```

**Checkpoint constraints:**

- MUST be JSON-serializable (no functions, circular refs, or non-JSON types)
- SHOULD contain references (IDs, hashes) rather than large payloads
- Runners MAY enforce size limits and reject oversized checkpoints

## API

### Returning Suspend Command

```typescript
const verifyClaim = defineStep({
  name: "verifyClaim",
  input: VerifyClaimInput,
  output: VerifyClaimDelta,

  async run({ input, adapters }) {
    const claim = await adapters.db.getClaim(input.claimId);
    const method = resolveVerificationMethod(claim);

    if (method === "documentation_required") {
      // Cannot proceed without founder input
      return {
        output: { status: "awaiting_input" },
        events: [
          { type: "verification_suspended", payload: { claimId: claim.id } },
        ],
        commands: [
          suspend({
            reason: "awaiting_documentation",
            checkpoint: {
              claimId: claim.id,
              claimText: claim.text,
              requestedDocType: "financial_statement",
            },
            resumeStep: "handleDocumentation",
          }),
        ],
      };
    }

    // Normal verification flow...
  },
});
```

### Command Builder

```typescript
function suspend(args: Omit<SuspendCommand, "type">): SuspendCommand {
  return { type: "suspend", ...args };
}
```

### Runner Handling

```typescript
// Runner interprets suspend command
async function handleStepResult(result: StepResult, tx: Transaction) {
  const commands = result.commands ?? [];
  const blockingCmds = commands.filter(
    (c) => c.type === "suspend" || c.type === "review",
  );

  // Validate: at most one blocking command
  if (blockingCmds.length > 1) {
    throw new OrchestrationError("Multiple blocking commands in step result");
  }

  const suspendCmd = commands.find((c) => c.type === "suspend");

  if (suspendCmd) {
    // Atomic: output + events + suspension record + run status
    await tx.runs.update(result.runId, { status: "suspended" });
    await tx.suspensions.insert({
      id: generateId(),
      workflowId: result.workflowId,
      workflowVersion: result.workflowVersion,
      runId: result.runId,
      stepName: result.stepName,
      reason: suspendCmd.reason,
      checkpoint: suspendCmd.checkpoint,
      resumeStep: suspendCmd.resumeStep ?? result.stepName,
      suspendedAt: new Date(),
    });
    // Sibling commands are discarded  – resumed step will emit new commands
    return;
  }

  // Normal command handling...
}
```

### Resume Flow

```typescript
// External trigger (e.g., founder uploaded document)
async function resumeWorkflow(suspensionId: string, resumeData: unknown) {
  // Atomic update: only succeeds if not already resumed
  const suspension = await db.suspensions.updateWhere(
    { id: suspensionId, resumedAt: null },
    { resumeData, resumedAt: new Date() },
  );

  if (!suspension) {
    throw new Error("Invalid or already resumed");
  }

  // Enqueue pointer, not payload (per kernel invariant #2)
  await queue.enqueue(suspension.resumeStep, { suspensionId });
}
```

The atomic `updateWhere` ensures only one caller wins the race. Concurrent resume attempts will fail the condition and return null.

The resume step loads checkpoint and resumeData from the suspension record:

```typescript
// Resume step handler
async function handleResumeJob(job: { suspensionId: string }) {
  const suspension = await db.suspensions.get(job.suspensionId);
  const input: ResumePayload = {
    checkpoint: suspension.checkpoint,
    resumeData: suspension.resumeData,
  };
  // Execute step with resume payload...
}
```

### Resume Step (Recommended)

Use a separate step for resume handling. This keeps each step focused and avoids input type unions:

```typescript
// Fresh execution step
const verifyClaim = defineStep({
  name: "verifyClaim",
  input: VerifyClaimInput,
  output: VerifyClaimDelta,

  async run({ input, adapters }) {
    const claim = await adapters.db.getClaim(input.claimId);

    if (needsDocumentation(claim)) {
      return {
        output: { status: "awaiting_input" },
        events: [],
        commands: [
          suspend({
            reason: "awaiting_documentation",
            checkpoint: { claimId: claim.id },
            resumeStep: "handleDocumentation",
          }),
        ],
      };
    }
    // ...
  },
});

// Separate resume handler
const handleDocumentation = defineStep({
  name: "handleDocumentation",
  input: z.object({
    checkpoint: z.object({ claimId: z.string() }),
    resumeData: z.object({ documentIds: z.array(z.string()) }),
  }),
  output: VerifyClaimDelta,

  async run({ input, adapters }) {
    const { checkpoint, resumeData } = input;
    const documents = await adapters.db.getDocuments(resumeData.documentIds);
    return verifyWithDocumentation(checkpoint.claimId, documents);
  },
});
```

This pattern keeps step inputs simple and explicit.

## Runner Contract

### 1. Atomic Persistence

When handling a `suspend` command, runners MUST persist the following atomically (single transaction):

- Step's output and events
- Suspension record
- Run status update to `suspended`

This follows the general command contract (SPEC-commands): commands are persisted atomically with output+events. Partial persistence leads to "state committed but no suspension record" or vice versa.

### 2. At Most One Blocking Command

A step result MUST NOT contain multiple blocking commands (`suspend` or `review`). Runners MUST fail the step execution if they find:

- Two or more `suspend` commands
- Two or more `review` commands
- Any combination of `suspend` and `review`

This is an orchestration error.

### 3. Suspend Discards Sibling Commands

When a `suspend` command is present, sibling commands are **discarded** (not deferred). The resumed step is responsible for emitting any needed commands.

```typescript
// The invoke command is discarded  – resumed step will emit new commands
commands: [
  suspend({ reason: "awaiting_input", checkpoint }),
  invoke("nextStep", data), // Discarded
];
```

Unlike `review`, sibling commands are deferred; `suspend` discards them.

### 4. Suspension Records Are Queryable

Runners MUST store suspensions in a queryable store (not ephemeral queue).

### 5. Resume Is Idempotent

Multiple resume attempts for the same suspension MUST be handled atomically:

- Use conditional update: `UPDATE ... WHERE resumed_at IS NULL RETURNING *`
- Only enqueue if the update affected a row
- Concurrent callers: exactly one wins, others get no-op or error

### 6. Checkpoint Immutability

The `checkpoint` field MUST NOT be modified after suspension. Resume data goes in a separate field. This preserves the exact state at suspension time for audit.

The suspension record follows append-only semantics: `resumeData` and `resumedAt` are set once on resume, never updated thereafter.

## Usage Patterns

A workflow may suspend at different points. Use `resumeStep` to route to the correct handler:

```typescript
// Suspend for documentation
commands: [
  suspend({
    reason: "awaiting_documentation",
    checkpoint,
    resumeStep: "handleDocumentation",
  }),
];

// Suspend for approval
commands: [
  suspend({
    reason: "awaiting_approval",
    checkpoint,
    resumeStep: "handleApproval",
  }),
];
```

## Anti-Patterns

### Polling for External State

```typescript
// BAD: busy-waiting in step
run: async (input, ctx) => {
  while (true) {
    const doc = await ctx.adapters.db.getDocument(input.docId);
    if (doc) return { output: { doc }, events: [] };
    await sleep(1000); // Blocks worker
  }
};

// GOOD: suspend and resume
run: async (input, ctx) => {
  const doc = await ctx.adapters.db.getDocument(input.docId);
  if (!doc) {
    return {
      output: {},
      events: [],
      commands: [
        suspend({
          reason: "awaiting_document",
          checkpoint: { docId: input.docId },
          resumeStep: "handleDocument",
        }),
      ],
    };
  }
  return { output: { doc }, events: [] };
};
```

### Mutable Checkpoint

```typescript
// BAD: modifying suspension record
await db.suspensions.update(id, {
  checkpoint: { ...suspension.checkpoint, newField: value }, // Mutates checkpoint
});

// GOOD: add to separate field
await db.suspensions.update(id, {
  resumeData: { documentIds: ["doc-1"] }, // Separate mutable field
});
```
