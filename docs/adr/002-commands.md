# ADR-002: Declarative Commands for Control Flow

## Status

Accepted

## Context

- **Problem**: Steps can express state changes (`delta`) and audit records (`events`), but have no way to express "what should happen next"
- **Why now**: Users need branching, fan-out, and human-in-the-loop patterns without Verist becoming an orchestrator
- **Constraints**: Must stay declarative; execution remains external per ADR-001

## Decision

- **Chosen option**: Add optional `commands: Command[]` to `StepOutput`
- **Rationale**:
  - Commands are declarative data, not executed by core
  - Enables control flow while keeping orchestration external
  - Minimal addition to existing API

## Alternatives

- **Workflow-level router function**: Adds complexity, another place for routing logic
- **Implicit routing via step names**: Magic behavior, hard to audit
- **No routing support**: Pushes complexity to every user

## Consequences

- **Positive**: Steps can express branching, fan-out, human review without coupling to infrastructure
- **Negative**: External runners must interpret commands
- **Follow-ups**: Document common patterns; consider command validation against workflow steps
