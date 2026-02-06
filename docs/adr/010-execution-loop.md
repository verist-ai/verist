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

**Rationale:** Prevents "commit succeeded but command lost," supports safe retries.

### 2. Deterministic Dedupe Keys

Each command gets a deterministic key: `hash(workflowId, runId, stepId, command)` (using stable serialization). The key is used as the queue job ID.

**Rationale:** Duplicate delivery dedupes cleanly; idempotency is provable.

**Queue requirement:** Completed jobs must be retained long enough to dedupe re-enqueues (e.g. BullMQ `removeOnComplete: { age: N }`).

### 3. Unified Block Model (Review + Suspend)

Represent blocking states in a single `verist_blocks` table with a `type` discriminator.

**Invariants:** One active block per run; one blocking command per step result. `resolveBlock()` is idempotent.

### 4. Command Status Lifecycle (Minimal)

Commands have status: `pending | deferred | leased | dispatched | rejected | failed`.

**Rationale:** Separates review gating (`deferred`), dispatch leasing, and terminal outcomes.

### 5. Runner Lives Outside Core

The execution loop (`executeStep` + `dispatchOutbox`) lives in `examples/`, not `@verist/core`.

### 6. Synthetic StepIds for Resume

Resume commands use `stepId = resume:<blockId>` to distinguish from normal invocations.

### 7. Lease-Based Dispatcher

Dispatcher uses `SELECT ... FOR UPDATE SKIP LOCKED` with lease fields. Expired leases can be reclaimed by any dispatcher.

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
