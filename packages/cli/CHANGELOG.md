# @verist/cli

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
