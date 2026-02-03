---
"@verist/cli": patch
---

Adopt recompute status semantics in diff, test, and output formatting

- `DiffCounts` tracks `schemaViolations`, `commandsChanged`, and `uncomparable` as separate counters
- `verist test` treats schema violations as always-fatal (exit 1), independent of `--no-fail-on-diff`
- Baseline output shows structured sections (schema violations, value changes, commands)
- Fix `import.meta.url` comparison using `pathToFileURL` for cross-platform correctness
