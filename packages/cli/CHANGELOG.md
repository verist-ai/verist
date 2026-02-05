# @verist/cli

## 0.0.9

### Patch Changes

- 31c3c00: Consolidate `@verist/core` + `@verist/replay` into single `verist` package
  - Merge core (step/workflow/run) and replay (snapshot/diff/recompute) into `verist` with curated root exports and `verist/internals` subpath for sibling packages
  - `@verist/cli`: `verist` is now a regular dependency (not peer) so `npm i -g @verist/cli` works standalone
  - All packages: import paths updated from `@verist/core` / `@verist/replay` to `verist`
  - Delete unused packages: `@verist/batch`, `@verist/pipeline`, `@verist/queue`, `@verist/otel`, `@verist/artifacts`

- Updated dependencies [31c3c00]
  - verist@0.0.2

## 0.0.8

### Patch Changes

- a07b649: Simplify adapter and options ergonomics across `run()` and `recompute()`
  - Remove phantom `adapters` field from `defineStep()` — adapter types are now inferred from `ctx` parameter annotation on `run`
  - Make `adapters` optional in `run()` when step has no adapters; the entire options arg is omissible
  - Always collect artifacts in `result.value.artifacts` (previously required `onArtifact` callback)
  - `recompute()` accepts adapters directly and derives workflow metadata from the snapshot, removing manual `createContextFactory` double-call

- Updated dependencies [a07b649]
  - @verist/core@0.0.9
  - @verist/replay@0.0.14

## 0.0.7

### Patch Changes

- Updated dependencies [eab0dd8]
  - @verist/core@0.0.8
  - @verist/replay@0.0.13

## 0.0.6

### Patch Changes

- Updated dependencies [61aba83]
  - @verist/core@0.0.7
  - @verist/replay@0.0.12

## 0.0.5

### Patch Changes

- 35ef0de: Fix missing shebang in built CLI binary and add `--label` filter to `test` and `diff` commands
  - `dist/cli.js` now starts with `#!/usr/bin/env node` so `npx verist` works correctly
  - `--label <name>` filters baselines in `verist test` and `verist diff`, matching existing `replay` behavior

- Updated dependencies [35ef0de]
  - @verist/replay@0.0.11

## 0.0.4

### Patch Changes

- 1ce7f88: Add init command, deterministic sampling, metadata filtering, and machine-readable output
  - `verist init` scaffolds a working project with a `parse-contact` step (no API keys needed)
  - `--sample <n>` and `--seed <n>` for deterministic input sampling in `capture`
  - `--meta <key=value>` for attaching metadata to baselines and filtering in diff/test/replay
  - `--format json|markdown` structured output for CI pipelines and PR comments

- 1ce7f88: Adopt recompute status semantics in diff, test, and output formatting
  - `DiffCounts` tracks `schemaViolations`, `commandsChanged`, and `diffUnavailable` as separate counters
  - `verist test` treats schema violations as always-fatal (exit 1), independent of `--no-fail-on-diff`
  - Baseline output shows structured sections (schema violations, value changes, commands)
  - Fix `import.meta.url` comparison using `pathToFileURL` for cross-platform correctness

- Updated dependencies [1ce7f88]
  - @verist/replay@0.0.10

## 0.0.3

### Patch Changes

- ab51d5f: Adopt recompute status semantics in diff, test, and output formatting
  - `DiffCounts` tracks `schemaViolations`, `commandsChanged`, and `diffUnavailable` as separate counters
  - `verist test` treats schema violations as always-fatal (exit 1), independent of `--no-fail-on-diff`
  - Baseline output shows structured sections (schema violations, value changes, commands)
  - Fix `import.meta.url` comparison using `pathToFileURL` for cross-platform correctness

- Updated dependencies [ab51d5f]
  - @verist/replay@0.0.9

## 0.0.2

### Patch Changes

- f6b283f: Add @verist/cli with capture, diff, and test commands for baseline-driven replay testing
- Updated dependencies [f6b283f]
  - @verist/replay@0.0.8
