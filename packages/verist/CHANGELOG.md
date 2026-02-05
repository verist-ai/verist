# verist

## 0.0.2

### Patch Changes

- 31c3c00: Consolidate `@verist/core` + `@verist/replay` into single `verist` package
  - Merge core (step/workflow/run) and replay (snapshot/diff/recompute) into `verist` with curated root exports and `verist/internals` subpath for sibling packages
  - `@verist/cli`: `verist` is now a regular dependency (not peer) so `npm i -g @verist/cli` works standalone
  - All packages: import paths updated from `@verist/core` / `@verist/replay` to `verist`
  - Delete unused packages: `@verist/batch`, `@verist/pipeline`, `@verist/queue`, `@verist/otel`, `@verist/artifacts`
