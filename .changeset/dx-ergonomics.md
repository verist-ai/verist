---
"verist": patch
"@verist/llm": patch
"@verist/storage": patch
"@verist/storage-pg": patch
---

Improve DX ergonomics across packages

- `StepOutput.events` is now optional (defaults to `[]`)
- `createSnapshotFromResult` auto-captures commands when present (opt out with `captureCommands: false`)
- `extract()` accepts step context — reads `ctx.adapters.llm` and `ctx.onArtifact` automatically
- Export `LLMContext` type alias for `StepContext<{ llm: LLMProvider }>`
- `store.load()` returns `err({ code: "not_found" })` instead of `ok(null)`
- `resolveBlock` uses `FOR UPDATE` locking to prevent concurrent resolver races
