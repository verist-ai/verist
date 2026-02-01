---
"@verist/pipeline": patch
---

**BREAKING:** Rename error handling option from `skip` to `continue`

- `onError: "skip"` → `onError: "continue"` (clearer semantics)
- `StageStatus` value `"skipped"` → `"continued"`
- Add `pipeline_stage_error` audit event for continued stages (maintains evidence trail)
- Fix `PipelineError.cause` to contain underlying error instead of wrapping `StepError`
