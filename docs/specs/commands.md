# SPEC: Commands

Commands are declarative data returned by steps to express "what should happen next." The kernel does not execute commands — external runners interpret them.

Commands are **intent, not action**. Steps return commands; runners decide how to execute them.

## Command Types

| Type      | Purpose                   | Runner Obligation                  |
| --------- | ------------------------- | ---------------------------------- |
| `invoke`  | Schedule another step     | Enqueue or execute the target step |
| `fanout`  | Schedule step N times     | Enqueue or execute for each input  |
| `review`  | Request human approval    | Create gate, block all commands    |
| `emit`    | External integration      | Publish to topic/queue             |
| `suspend` | Await external input/data | Persist suspension, block commands |

Commands are kernel-defined: `invoke | fanout | review | emit | suspend`. For custom integrations, use `emit` with a topic (e.g., `emit("slack:alerts", payload)`) or `invoke` a dedicated integration step.

## Runner Contract

### 1. Commands MUST Be Handled

Runners MUST either:

- Execute the command, or
- Persist it for later execution

Silently ignoring commands violates the contract. Commands SHOULD be persisted atomically with `delta + events` to prevent "committed state but lost command" scenarios.

### 2. Blocking Commands: Review and Suspend

`review` and `suspend` are **blocking commands** — they halt execution of sibling commands.

**At most one blocking command**: A step result MUST NOT contain multiple blocking commands. Runners MUST fail the step execution if they find two or more `suspend`, two or more `review`, or any combination of both. This is an orchestration error.

**Review** (human approval):

- Step delta/events are committed as **provisional state**
- Sibling commands are **deferred** until review resolves
- Run enters "pending review" state
- Resolution: approve (execute deferred), reject (discard deferred), override (apply correction, then continue)

**Suspend** (await external data):

- The step's delta and events are committed
- A suspension record is created with the checkpoint
- All sibling commands are **discarded** (not deferred)
- The run enters "suspended" state

Resume flow: external trigger calls resume, runner invokes `resumeStep` with `{ checkpoint, resumeData }`, resumed step emits new commands.

The distinction: `review` awaits human judgment on computed results (sibling commands remain valid); `suspend` awaits external data that may change execution context (sibling commands may no longer be valid).

### 3. Command Order Is Advisory

For commands without a `review` barrier, array order is advisory. Runners MAY:

- Execute in parallel (multiple `invoke` to independent steps)
- Batch `fanout` items
- Reorder for efficiency

Runners MUST NOT reorder in ways that violate data dependencies.

### 4. Idempotency

Runners SHOULD deduplicate command execution. A recommended approach:

```text
commandKey = hash(workflowId, runId, stepName, canonicalized(command))
```

Use stable JSON serialization (sorted keys) for the command payload. Execute each `commandKey` at most once.

`suspend` commands are idempotent at the runner level: repeated execution MUST NOT create multiple open suspension records for the same `(workflowId, runId, stepName)`. This is typically enforced via database constraint (see SPEC-suspend).

## Command Details

### invoke

```typescript
{ type: "invoke", step: string, input: unknown }
```

Request another step to run. The `step` field is a step name. Runners resolve names to implementations.

### fanout

```typescript
{ type: "fanout", step: string, inputs: unknown[] }
```

Equivalent to multiple `invoke` commands:

```typescript
// fanout("process", [a, b, c]) is equivalent to:
commands: [invoke("process", a), invoke("process", b), invoke("process", c)];
```

Runners MAY parallelize. Results are typically aggregated by a subsequent step that queries state.

### review

```typescript
{ type: "review", reason: string, payload?: unknown }
```

Request human review. The `reason` explains why. Optional `payload` provides context.

Runners MUST track review state.

### emit

```typescript
{ type: "emit", topic: string, payload: unknown }
```

Publish to an external system. Unlike audit events (internal log), emit is for integration: webhooks, message buses, notifications. Emit commands are not replayed during recompute — they represent one-time side effects.

Use topic namespacing for routing (e.g., `doc.verified`, `slack:alerts`).

### suspend

```typescript
{ type: "suspend", reason: string, checkpoint: unknown, resumeStep?: string }
```

Pause workflow execution until external data arrives. The `checkpoint` captures serialized state for resume (MUST be JSON-serializable). `resumeStep` specifies which step handles the resume (defaults to the suspending step, but a dedicated resume handler is recommended).

```typescript
// Suspend with explicit resume handler (recommended)
commands: [
  suspend({
    reason: "awaiting_documentation",
    checkpoint: { claimId, requestedDocType: "financial" },
    resumeStep: "handleDocumentation",
  }),
];

// Suspend for webhook callback
commands: [
  suspend({
    reason: "awaiting_callback",
    checkpoint: { webhookId },
    resumeStep: "handleWebhookResponse",
  }),
];
```

See SPEC-suspend for full resume semantics and runner contract.

## Anti-Patterns

- Executing commands inside steps (side effects in step code)
- Assuming command array order implies execution order
