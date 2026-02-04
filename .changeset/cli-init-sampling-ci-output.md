---
"@verist/cli": patch
---

Add init command, deterministic sampling, metadata filtering, and machine-readable output

- `verist init` scaffolds a working project with a `parse-contact` step (no API keys needed)
- `--sample <n>` and `--seed <n>` for deterministic input sampling in `capture`
- `--meta <key=value>` for attaching metadata to baselines and filtering in diff/test/replay
- `--format json|markdown` structured output for CI pipelines and PR comments
