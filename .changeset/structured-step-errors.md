---
"verist": patch
---

Add structured step errors via `fail()` — steps can return `fail(code, message, opts?)` instead of throwing, preserving error code and retryable flag through `runStep()` and `recompute()`. `StepError` and `RecomputeError` now include a `retryable` field. `StepResult` collects adapter-emitted artifacts.
