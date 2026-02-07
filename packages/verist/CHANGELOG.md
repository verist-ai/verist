# verist

## 0.0.6

### Patch Changes

- 5bd9b52: Add README for core package npm page, add missing badges to storage README

## 0.0.5

### Patch Changes

- 0d73f49: Add structured step errors via `fail()` — steps can return `fail(code, message, opts?)` instead of throwing, preserving error code and retryable flag through `runStep()` and `recompute()`. `StepError` and `RecomputeError` now include a `retryable` field. `StepResult` collects adapter-emitted artifacts.

## 0.0.4

### Patch Changes

- ded9252: Add ctx.emitEvent, recompute ergonomics, and CLI improvements
  - `ctx.emitEvent()` callback on StepContext for audit events from adapters
  - `extract(ctx, ...)` auto-emits `"llm.extracted"` audit event via `ctx.emitEvent`
  - `recompute()` accepts `StepResult` in addition to `Snapshot`
  - `recompute({ validate: true })` is now the default
  - CLI: mixed-step detection in `--baseline` directory mode
  - CLI: markdown output separates regressions from errors
  - CLI: `commandsChanged` now triggers "fail" status

- ded9252: Rename delta → output across all APIs and flatten StepResult
  - `StepConfig.delta` → `StepConfig.output`
  - `StepOutput` → `StepReturn` (step run return type)
  - `StepDelta<S>` → `StepOutput<S>` (utility type)
  - `Step.deltaSchema` → `Step.outputSchema`, `Step.outputDeltaSchema` → `Step.partialOutputSchema`
  - `StepResult.output` flattened: `output`, `events`, `commands` as top-level fields
  - `RecomputeResult.deltaDiff` → `outputDiff`, `parsedDelta` → `parsedOutput`, `output` → `rawOutput`
  - `StateSnapshot` → `RunState`
  - `CommitParams.delta` → `CommitParams.output`, `CommitParams.events` optional
  - Remove `Delta<T>` type alias (use `Partial<T>` directly)

## 0.0.3

### Patch Changes

- a7cd6f1: Improve DX ergonomics across packages
  - `StepReturn.events` is now optional (defaults to `[]`)
  - `createSnapshotFromResult` auto-captures commands when present (opt out with `captureCommands: false`)
  - `extract()` accepts step context — reads `ctx.adapters.llm` and `ctx.onArtifact` automatically
  - Export `LLMContext` type alias for `StepContext<{ llm: LLMProvider }>`
  - `store.load()` returns `err({ code: "not_found" })` instead of `ok(null)`
  - `resolveBlock` uses `FOR UPDATE` locking to prevent concurrent resolver races

## 0.0.2

### Patch Changes

- 31c3c00: Consolidate `@verist/core` + `@verist/replay` into single `verist` package
  - Merge core (step/workflow/run) and replay (snapshot/diff/recompute) into `verist` with curated root exports and `verist/internals` subpath for sibling packages
  - `@verist/cli`: `verist` is now a regular dependency (not peer) so `npm i -g @verist/cli` works standalone
  - All packages: import paths updated from `@verist/core` / `@verist/replay` to `verist`
  - Delete unused packages: `@verist/batch`, `@verist/pipeline`, `@verist/queue`, `@verist/otel`, `@verist/artifacts`
