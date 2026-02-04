# CI Integration

Verist CLI supports machine-readable output for CI pipelines. Use `--format json` for scripting or `--format markdown` for PR comments.

## Output formats

```bash
verist test --step extract-claims --format json      # structured JSON
verist test --step extract-claims --format markdown   # summary table
verist test --step extract-claims --format text       # human-readable (default)
```

### JSON schema

```json
{
  "version": 1,
  "step": "extract-claims",
  "status": "pass",
  "summary": "12 baseline(s), 11 clean, 1 changed",
  "counts": {
    "total": 12,
    "passed": 11,
    "changed": 1,
    "schemaViolations": 0,
    "failed": 0,
    "commandsChanged": 0,
    "diffUnavailable": 0
  },
  "baselines": [
    {
      "filename": "invoice-a1b2c3d4.json",
      "status": "value_changed",
      "comparable": true,
      "schemaViolations": [],
      "deltaDiff": { "equal": false, "entries": [...] },
      "commandsDiff": null
    }
  ]
}
```

### JSON `status` field

| Value     | Meaning                                                         |
| --------- | --------------------------------------------------------------- |
| `"pass"`  | All baselines clean                                             |
| `"fail"`  | Regressions detected (value changes, schema violations)         |
| `"error"` | Infrastructure failure (corrupted baselines, execution crashes) |

## Exit codes

| Code | Meaning                                                   |
| ---- | --------------------------------------------------------- |
| 0    | Clean — no regressions                                    |
| 1    | Regressions detected                                      |
| 2    | Infrastructure failure (config error, corrupted baseline) |

## GitHub Actions

### Basic: fail on regressions

```yaml
name: Verist regression check
on: [push, pull_request]

jobs:
  verist-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bunx verist test --step extract-claims
```

### PR comment with markdown summary

```yaml
name: Verist diff report
on: pull_request

jobs:
  verist-diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install

      - name: Run verist test
        continue-on-error: true
        run: bunx verist test --step extract-claims --format markdown > verist-report.md

      - name: Comment on PR
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          path: verist-report.md
```

### JSON output for custom logic

```yaml
- name: Run verist test (JSON)
  continue-on-error: true
  run: bunx verist test --step extract-claims --format json > verist-result.json

- name: Parse results
  id: verist
  run: |
    status=$(jq -r '.status' verist-result.json)
    changed=$(jq '.counts.changed' verist-result.json)
    echo "status=$status" >> "$GITHUB_OUTPUT"
    echo "changed=$changed" >> "$GITHUB_OUTPUT"

- name: Check results
  if: steps.verist.outputs.status == 'fail'
  run: |
    echo "Verist detected ${{ steps.verist.outputs.changed }} changed baselines"
    exit 1
```

## Sampling for large baseline sets

For steps with many inputs, use `--sample` during capture for faster CI runs:

```bash
verist capture --step extract-claims --input "inputs/*.json" --sample 50 --seed 42
verist test --step extract-claims
```

The `--seed` option ensures deterministic selection across runs. Omit `--seed` for a default seed of 0.

## Metadata filtering

Tag baselines during capture and filter during test:

```bash
# Capture with metadata
verist capture --step extract-claims --input "inputs/*.json" --meta model=gpt-4o

# Test only specific metadata
verist test --step extract-claims --meta model=gpt-4o --format json
```
