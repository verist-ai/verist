# ADR-006: Command Categories

## Status

Accepted

## Context

- **Problem**: Commands have implicit semantic categories that affect how runners must handle them, but this is not documented
- **Why now**: Helper functions (`isControlCommand`, `isBlockingCommand`, `isSideEffectCommand`) were added in #9, formalizing the categories
- **Constraints**: Categories must align with existing command semantics and runner contracts

## Decision

- **Chosen option**: Document three command categories with distinct behaviors
- **Rationale**:
  - Makes implicit semantics explicit for implementers
  - Guides correct runner implementation
  - Helps users reason about command effects

## Categories

| Category | Commands        | Behavior                            | Helper                  |
| -------- | --------------- | ----------------------------------- | ----------------------- |
| Control  | invoke, fanout  | Dispatch execution to other steps   | `isControlCommand()`    |
| Barrier  | review, suspend | Block until external input resolves | `isBlockingCommand()`   |
| Effect   | emit            | Produce side effects, not replayed  | `isSideEffectCommand()` |

### Control Commands

Dispatch execution to other steps. The runner schedules the target step(s) for execution.

- **invoke**: Single step execution with given input
- **fanout**: Multiple parallel executions of the same step with different inputs

Control commands do not block the current step's completion.

### Barrier Commands

Block workflow execution until external input arrives. The runner must persist the suspension and resume when the barrier resolves.

- **review**: Human approval gate. Sibling commands are deferred until review resolves.
- **suspend**: Wait for external data/callback. Sibling commands are discarded – the resumed step emits new commands.

Both require the runner to persist state for later resumption.

### Effect Commands

Produce side effects to external systems. Not replayed during recomputation.

- **emit**: Publish domain event to external topic/queue

Effect commands are fire-and-forget from the step's perspective.

## Alternatives

- **No formal categories**: Leaves semantics implicit, harder for implementers
- **Per-command documentation only**: Misses the grouping insight
- **More granular categories**: Over-complicates for current command set

## Consequences

- **Positive**: Clear contract for runner implementations; easier reasoning about command effects
- **Negative**: None – documentation only
- **Follow-ups**: Consider category-specific validation in future runner implementations
