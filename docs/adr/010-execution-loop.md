# ADR-010: Execution Loop with Outbox Pattern

## Status

Accepted

## Context

- **Problem**: The kernel defines step execution semantics but provides no reference implementation for the execution loop (queue -> run -> persist -> enqueue next). SPEC-commands requires atomic persistence of commands with output+events, but this isn't implemented.
- **Why now**: Adoption stalls without a runnable end-to-end example. Users cannot validate the kernel works in production-like conditions.
- **Constraints**: Must work with at-least-once delivery queues. Must handle "commit succeeded but enqueue failed" and vice versa.

## Decision

### 1. Transactional Outbox for Command Dispatch

Persist commands in an outbox table atomically with state commit. A separate dispatcher drains the outbox to the queue.

**Rationale:**

- Atomic commit prevents "state persisted but command lost" (workflow stalls)
- Dispatcher retries are safe due to deterministic dedupe keys
- Standard pattern; well-understood failure modes

### 2. Deterministic Dedupe Keys

Each command gets a deterministic key: `hash(workflowId, runId, stepId, command)`. This key is stored in the outbox and used as the queue's job ID.

**Rationale:**

- Duplicate delivery produces same key → queue deduplicates
- Idempotency is provable, not assumed
- Works with any queue that supports job ID deduplication
- Identical commands from the same step dedupe naturally (correct for retries)
- No reliance on array index order (avoids non-determinism from `Object.values()`, `Set`, etc.)
- Hash uses `stableStringify` (sorted object keys) for determinism regardless of property order

**Queue requirement:** The queue must retain completed jobs long enough to deduplicate re-enqueues during the "enqueue succeeded, markDispatched failed" window. For BullMQ, use `removeOnComplete: { age: N }` instead of `removeOnComplete: true`.

### 3. Unified Block Model (Review + Suspend)

A **block** is a durable wait state for external input — workflow execution pauses until a human or system provides a resolution.

Store blocking state in a single `verist_blocks` table with a `type` discriminator rather than separate tables for review and suspend.

**Invariants:**

- At most one active (unresolved) block per run (enforced by partial unique index)
- At most one blocking command per step result (enforced at commit time)

**Idempotency:** `resolveBlock()` is idempotent — repeated calls (HTTP retries, UI double-clicks) return success. For suspend, the resume command is inserted with `ON CONFLICT DO NOTHING` to handle the case where a previous resolve created it but the caller didn't receive confirmation.

**Rationale:**

- Both are "workflow is blocked, awaiting external input"
- Unified API (`getBlock`/`resolveBlock`) ages better than parallel subsystems
- Simpler schema; easier to extend
- Single-block invariant prevents deadlocks from unresolvable multi-block states

### 4. Command Status Lifecycle

Commands have status: `pending | deferred | leased | dispatched | rejected | failed`.

- `pending`: Ready to dispatch
- `deferred`: Held for review approval
- `leased`: Claimed by dispatcher for processing
- `dispatched`: Successfully enqueued (terminal)
- `rejected`: Review denied (terminal)
- `failed`: Explicit operator action (terminal, reserved)

**Transitions:**

- Review approved: `deferred` → `pending`
- Review rejected: `deferred` → `rejected`
- Dispatch success: `leased` → `dispatched`
- Lease expiry: `leased` → eligible for re-lease (automatic retry)

**Transient dispatch errors** (Redis down, network blip) do not mark entries as terminal. The dispatcher logs the error and lets the lease expire; the entry becomes eligible for retry on the next dispatch cycle. This makes the system self-healing under transient failures.

**Terminal states** (`dispatched`, `rejected`, `failed`) never transition. The `failed` status is reserved for explicit operator action or future error classification — it is not used by the default dispatcher for transient errors. The `markFailed()` method exists for operator tooling and custom dispatchers, but is not part of the default dispatch protocol.

### 5. Runner Lives Outside Core

The execution loop (`executeStep` + `dispatchOutbox`) is placed in `examples/`, not `@verist/core`. The kernel boundary ("orchestration is external") is preserved.

**Rationale:**

- Keeps kernel pure and runtime-agnostic
- Runner patterns may vary by environment
- Extract to `@verist/runner` later if patterns stabilize

### 6. Synthetic StepIds for Resume

When a suspend block is resolved, the resume command uses a synthetic stepId: `resume:<blockId>`. This distinguishes resume invocations from regular step calls in audit logs and dedupe keys.

**Invariant:** Tooling and step registries must tolerate unknown stepIds prefixed with `resume:`.

### 7. Lease-Based Dispatcher

Dispatcher uses `SELECT ... FOR UPDATE SKIP LOCKED` with lease fields to prevent duplicate processing by concurrent dispatchers.

**Lease reclaim:** Expired leases can be reclaimed by any dispatcher regardless of the original owner. This is intentional — it handles dispatcher crashes without requiring coordination.

## Alternatives

- **No outbox (direct enqueue after commit)**: Rejected. "Commit succeeded, enqueue failed" causes silent workflow stalls. Kernel idempotency doesn't help here.

- **Separate review/suspend tables**: Rejected. Creates parallel subsystems that drift. Unified model with type discriminator is simpler and more extensible.

- **Runner in `@verist/core`**: Rejected. Violates "orchestration is external" principle. Blurs kernel boundary.

- **Random job IDs**: Rejected. Breaks idempotency proof. Duplicate delivery would create duplicate jobs.

## Consequences

- **Positive**: End-to-end execution is demonstrably correct. Failure modes are explicit. Idempotency is provable.
- **Negative**: One more table (outbox). Dispatcher is a separate process/loop.
- **Follow-ups**: Implement `@verist/storage-pg` adapter, `@verist/queue` BullMQ adapter, canonical example.

## References

- SPEC-commands: Commands SHOULD be persisted atomically with output + events
- SPEC-suspend: Runner contract for blocking commands
