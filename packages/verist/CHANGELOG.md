# verist

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
