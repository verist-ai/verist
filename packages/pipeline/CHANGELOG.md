# @verist/pipeline

## 0.0.6

### Patch Changes

- Updated dependencies [a07b649]
  - @verist/core@0.0.9

## 0.0.5

### Patch Changes

- Updated dependencies [eab0dd8]
  - @verist/core@0.0.8

## 0.0.4

### Patch Changes

- Updated dependencies [61aba83]
  - @verist/core@0.0.7

## 0.0.3

### Patch Changes

- 119e0b0: Fix null delta handling and add validation consistency
  - Fix pipeline `??` operator treating `null` as missing delta
  - Add name/version validation to `defineWorkflow`
  - Add name validation to `definePipeline` and `runPipeline`
  - Add `.min(1)` to command schema strings (step, reason, topic)
  - Rename audit event `pipeline_stage_error` → `pipeline.stage_error`

- 98a4883: **BREAKING:** Rename error handling option from `skip` to `continue`
  - `onError: "skip"` → `onError: "continue"` (clearer semantics)
  - `StageStatus` value `"skipped"` → `"continued"`
  - Add `pipeline_stage_error` audit event for continued stages (maintains evidence trail)
  - Fix `PipelineError.cause` to contain underlying error instead of wrapping `StepError`

- Updated dependencies [98a4883]
- Updated dependencies [119e0b0]
  - @verist/core@0.0.6

## 0.0.2

### Patch Changes

- Updated dependencies
  - @verist/core@0.0.5
