# @verist/cli

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
