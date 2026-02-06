# SPEC: Kernel Invariants

Core guarantees that Verist maintains at all times. Code that violates these invariants is incorrect.

These invariants are part of the **Tier 1 (Kernel)** stability guarantee (see ADR-005).

## 1. Steps Are Pure

Given identical inputs and artifact playback, a step produces identical outputs. Side effects happen through adapters, not directly in step code.

## 2. State Lives in Database

The database is the source of truth. In-memory state is ephemeral. Queue jobs are pointers, not payloads.

## 3. Commands Are Data

Steps return commands as plain objects describing intent. The kernel does not execute commands – runners interpret them.

## 4. Outputs Are Partial

Steps return partial state updates (changed fields only). Runners merge outputs into persisted state.

## 5. Events Are Immutable

Audit events are append-only. They are never modified or deleted.

## 6. Replay Is Exact

With captured artifacts, replay produces byte-identical outputs. All nondeterminism must be artifacted.

## 7. Overlay Wins

Human corrections (overlay) take precedence over computed values when deriving effective state.

## 8. Hashes Are Mandatory

Every LLM interaction records input and output hashes to enable audit, dedupe, and correlation.

## 9. Errors Are Values

Expected failures return `Result` values; thrown exceptions indicate bugs, not business logic failures. See ADR-012.

## 10. Version Is Auditable

Every step execution records the workflow version and exposes it in results.

## 11. No Runtime Assumptions

Steps and runners must assume short-lived, stateless execution. No reliance on durable memory, background loops, or local filesystem state.
