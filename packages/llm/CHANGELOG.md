# @verist/llm

## 0.0.17

### Patch Changes

- 0805a31: Ship pre-built .d.ts declarations instead of serving types from source
- Updated dependencies [0805a31]
  - verist@0.0.7

## 0.0.16

### Patch Changes

- Updated dependencies [5bd9b52]
  - verist@0.0.6

## 0.0.15

### Patch Changes

- 0d73f49: Add `defineExtractionStep()` shorthand for the common pattern of building an LLM request from input, extracting structured data, and returning it as output.
- Updated dependencies [0d73f49]
  - verist@0.0.5

## 0.0.14

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

- Updated dependencies [ded9252]
- Updated dependencies [ded9252]
  - verist@0.0.4

## 0.0.13

### Patch Changes

- a7cd6f1: Improve DX ergonomics across packages
  - `StepReturn.events` is now optional (defaults to `[]`)
  - `createSnapshotFromResult` auto-captures commands when present (opt out with `captureCommands: false`)
  - `extract()` accepts step context — reads `ctx.adapters.llm` and `ctx.onArtifact` automatically
  - Export `LLMContext` type alias for `StepContext<{ llm: LLMProvider }>`
  - `store.load()` returns `err({ code: "not_found" })` instead of `ok(null)`
  - `resolveBlock` uses `FOR UPDATE` locking to prevent concurrent resolver races

- Updated dependencies [a7cd6f1]
  - verist@0.0.3

## 0.0.12

### Patch Changes

- 81cdfe6: Add `responseFormat` option to `LLMRequest` for requesting JSON output from providers
- 81cdfe6: Add `extract()` helper for structured LLM data extraction

  Combines `complete()` → JSON.parse → schema.parse into a single call with `Result`-based error handling. Uses a generic `{ parse }` schema interface (works with Zod, ArkType, or custom validators). Strips ` ```json ``` ` fences automatically. Error codes distinguish `json_error` (non-JSON response) from `schema_error` (valid JSON, wrong shape) for retry policies.

- 31c3c00: Consolidate `@verist/core` + `@verist/replay` into single `verist` package
  - Merge core (step/workflow/run) and replay (snapshot/diff/recompute) into `verist` with curated root exports and `verist/internals` subpath for sibling packages
  - `@verist/cli`: `verist` is now a regular dependency (not peer) so `npm i -g @verist/cli` works standalone
  - All packages: import paths updated from `@verist/core` / `@verist/replay` to `verist`
  - Delete unused packages: `@verist/batch`, `@verist/pipeline`, `@verist/queue`, `@verist/otel`, `@verist/artifacts`

- Updated dependencies [31c3c00]
  - verist@0.0.2

## 0.0.11

### Patch Changes

- a07b649: Add `responseFormat` option to `LLMRequest` for requesting JSON output from providers
- a07b649: Add `extract()` helper for structured LLM data extraction

  Combines `complete()` → JSON.parse → schema.parse into a single call with `Result`-based error handling. Uses a generic `{ parse }` schema interface (works with Zod, ArkType, or custom validators). Strips ` ```json ``` ` fences automatically. Error codes distinguish `json_error` (non-JSON response) from `schema_error` (valid JSON, wrong shape) for retry policies.

- Updated dependencies [a07b649]
  - @verist/core@0.0.9

## 0.0.10

### Patch Changes

- 0acd4ff: Add `responseFormat` option to `LLMRequest` for requesting JSON output from providers

## 0.0.9

### Patch Changes

- Updated dependencies [eab0dd8]
  - @verist/core@0.0.8

## 0.0.8

### Patch Changes

- Updated dependencies [61aba83]
  - @verist/core@0.0.7

## 0.0.7

### Patch Changes

- 1ce7f88: Add Anthropic provider adapter with cross-provider hash equivalence
  - `createAnthropic()` replaces placeholder stub with full implementation
  - System messages extracted into Anthropic's `system` parameter
  - Error mapping (429 → rate_limit, 401 → invalid_request, 5xx → provider_error)
  - Output hash normalized to same shape as OpenAI adapter for cross-provider comparison

## 0.0.6

### Patch Changes

- dbed3be: Add `onArtifact` callback to `complete()` for emitting `llm-input` and `llm-output` artifacts

## 0.0.5

### Patch Changes

- b5814f0: Widen `OpenAIClientLike.create` param type to accept OpenAI SDK's overloaded method signatures

## 0.0.4

### Patch Changes

- 98a4883: Use shared `stableStringify` from @verist/core for consistency across packages
- Updated dependencies [98a4883]
- Updated dependencies [119e0b0]
  - @verist/core@0.0.6

## 0.0.3

### Patch Changes

- e23e0b2: Add OpenAI adapter with trace hashing for replay detection
