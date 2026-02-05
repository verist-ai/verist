---
"verist": patch
"@verist/storage": patch
"@verist/storage-pg": patch
"@verist/llm": patch
"@verist/cli": patch
---

Rename delta → output across all APIs and flatten StepResult

- `StepConfig.delta` → `StepConfig.output`
- `StepOutput` → `StepReturn` (step run return type)
- `StepDelta<S>` → `StepOutput<S>` (utility type)
- `Step.deltaSchema` → `Step.outputSchema`, `Step.outputDeltaSchema` → `Step.partialOutputSchema`
- `StepResult.output` flattened: `output`, `events`, `commands` as top-level fields
- `RecomputeResult.deltaDiff` → `outputDiff`, `parsedDelta` → `parsedOutput`, `output` → `rawOutput`
- `StateSnapshot` → `RunState`
- `CommitParams.delta` → `CommitParams.output`, `CommitParams.events` optional
- Remove `Delta<T>` type alias (use `Partial<T>` directly)
