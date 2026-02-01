# ADR-001: Deterministic State Machine Over Autonomous Agents

## Status

Accepted

## Context

- **Problem**: How should Verist orchestrate AI workflows?
- **Why now**: Foundational decision that shapes the entire API
- **Constraints**: Must support audit trails, reproducibility, regulatory compliance

## Decision

- **Chosen option**: Explicit state machine with pure step functions
- **Rationale**:
  - Steps are testable in isolation
  - State transitions are inspectable and replayable
  - No hidden control flow or emergent behavior

## Alternatives

- **Autonomous agents**: LLM decides next action. Rejected – non-deterministic, hard to audit, unpredictable costs
- **DAG orchestrator (Airflow-style)**: External orchestration service. Rejected – operational overhead, state lives outside domain database

## Consequences

- **Positive**: Full auditability, reproducible runs, simple debugging (read SQL + step code)
- **Negative**: More explicit wiring required, no "magic" agent loops
- **Follow-ups**: Define step interface (ADR-002), audit event schema (ADR-003)
