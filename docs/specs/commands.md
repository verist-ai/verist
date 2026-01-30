# SPEC: Commands

Commands are declarative data returned by steps to express "what should happen next." The kernel does not execute commands — external runners interpret them.

## Core Principle

Commands are **intent, not action**. Steps return commands; runners decide how to execute them. This separation keeps steps pure and orchestration flexible.

## Command Types

| Type     | Purpose               | Runner Obligation                  |
| -------- | --------------------- | ---------------------------------- |
| `invoke` | Schedule another step | Enqueue or execute the target step |
| `fanout` | Schedule step N times | Enqueue or execute for each input  |
| `review` | Request human review  | Create gate, block all commands    |
| `emit`   | External integration  | Publish to topic/queue             |

Commands form a closed union: `invoke | fanout | review | emit`. For custom integrations, use `emit` with a topic (e.g., `emit("slack:alerts", payload)`) or `invoke` a dedicated integration step.

## Runner Contract

### 1. Commands MUST Be Handled

Runners MUST either:

- Execute the command, or
- Persist it for later execution

Silently ignoring commands violates the contract. Commands SHOULD be persisted atomically with `delta + events` to prevent "committed state but lost command" scenarios.

### 2. Review Is a Barrier

When a step output includes a `review` command:

- The step's delta and events are committed as **provisional state**
- **All other commands from that step output are deferred** until review resolves
- The run enters "pending review" state

Provisional state is persisted for audit, but runners MUST NOT treat it as externally effective until review resolves. This applies regardless of command array order.

Resolution options (runner-defined):

- **approve**: Execute deferred commands
- **reject**: Run enters terminal state; deferred commands are discarded
- **override**: Apply correction to overlay (computed state remains intact), then continue

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

Runners MUST track review state. Example schema:

```typescript
interface ReviewGate {
  workflowId: string;
  runId: string;
  stepName: string;
  reason: string;
  payload?: unknown;
  status: "pending" | "approved" | "rejected";
  resolvedBy?: string;
  resolvedAt?: Date;
}
```

### emit

```typescript
{ type: "emit", topic: string, payload: unknown }
```

Publish to an external system. Unlike audit events (internal log), emit is for integration: webhooks, message buses, notifications. Emit commands are not replayed during recompute — they represent one-time side effects.

Use topic namespacing for routing:

- `"doc.verified"` → domain event bus
- `"slack:alerts"` → Slack channel
- `"webhook:partner-api"` → external webhook

## Anti-Patterns

### Executing Commands in Steps

```typescript
// BAD: side effect in step
run: async (input, ctx) => {
  await ctx.adapters.queue.enqueue("next", { id: input.id });
  return { delta: {}, events: [] };
};

// GOOD: declarative
run: async (input, ctx) => ({
  delta: {},
  events: [],
  commands: [invoke("next", { id: input.id })],
});
```

### Assuming Command Order

```typescript
// BAD: depends on execution order
commands: [
  invoke("step-a", input),
  invoke("step-b", { needsResultFrom: "step-a" }),
];

// GOOD: step-b reads from persisted state
// step-a writes result to state; step-b loads it
```

## Summary

| Principle         | Requirement                             |
| ----------------- | --------------------------------------- |
| Closed union      | Four types only; extend via emit/invoke |
| No silent drops   | Execute or persist, never ignore        |
| Review is barrier | Blocks all sibling commands             |
| Order is advisory | Parallel OK when no review present      |
| Idempotency       | Deduplicate by deterministic key        |
