---
"verist": patch
"@verist/llm": patch
"@verist/cli": patch
---

Add ctx.emitEvent, recompute ergonomics, and CLI improvements

- `ctx.emitEvent()` callback on StepContext for audit events from adapters
- `extract(ctx, ...)` auto-emits "extracted" audit event via `ctx.emitEvent`
- `recompute()` accepts `StepResult` in addition to `Snapshot`
- `recompute({ validate: true })` is now the default
- CLI: mixed-step detection in `--baseline` directory mode
- CLI: markdown output separates regressions from errors
- CLI: `commandsChanged` now triggers "fail" status
