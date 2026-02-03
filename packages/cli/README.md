# @verist/cli

[![npm version](https://badge.fury.io/js/@verist%2Fcli.svg)](https://badge.fury.io/js/@verist%2Fcli)
[![npm downloads](https://img.shields.io/npm/dm/@verist/cli.svg)](https://npmjs.com/package/@verist/cli)
[![Ask ChatGPT](https://img.shields.io/badge/Ask_ChatGPT-10a37f?logo=google+gemini&logoColor=white)](https://chatgpt.com/g/g-697e23b923088191b8cb315bebf14a3b-verist-architect)
[![Twitter Follow](https://img.shields.io/twitter/follow/verist_ai?style=social)](https://x.com/verist_ai)

CLI for Verist workflows — replay, diff, and inspect AI decisions.

## Install

```bash
bun add @verist/cli
```

## Commands

### `verist capture`

Run a step against input files and save baselines.

```bash
verist capture --step extract --input "inputs/*.json"
verist capture --step extract --input "inputs/*.json" --label "v2-prompt"
```

| Option            | Description                                  |
| ----------------- | -------------------------------------------- |
| `--step <name>`   | Step name to execute (required)              |
| `--input <glob>`  | Glob pattern for input JSON files (required) |
| `--workflow <id>` | Workflow identifier (defaults to step name)  |
| `--version <ver>` | Workflow version (defaults to `"0.0.0"`)     |
| `--label <text>`  | Human-readable label for the baseline        |
| `--no-commands`   | Skip capturing commands                      |

### `verist diff`

Recompute baselines and show diffs (exploratory).

```bash
verist diff --step extract
verist diff --baseline .verist/baselines/extract/001.json
```

| Option              | Description                                 |
| ------------------- | ------------------------------------------- |
| `--step <name>`     | Step name to recompute                      |
| `--baseline <path>` | Path to specific baseline file or directory |
| `--workflow <id>`   | Workflow identifier for auto-resolution     |
| `--version <ver>`   | Workflow version for auto-resolution        |

### `verist replay`

Inspect baselines and verify hash integrity.

```bash
verist replay --step extract
verist replay --step extract --verify
verist replay --baseline .verist/baselines/ --label "v2-prompt"
```

Use `--verify` to recompute hashes and check that stored content matches.

| Option              | Description                          |
| ------------------- | ------------------------------------ |
| `--step <name>`     | Filter by step name                  |
| `--baseline <path>` | Specific file or directory           |
| `--label <name>`    | Filter by metadata label             |
| `--workflow <id>`   | Workflow identifier                  |
| `--version <ver>`   | Workflow version                     |
| `--verify`          | Recompute hashes and check integrity |

### `verist test`

Recompute baselines and fail on regressions (CI mode).

Exit codes: `0` = clean, `1` = regressions detected, `2` = infrastructure failure.

Schema violations always trigger exit `1`, independent of `--no-fail-on-diff`.

```bash
verist test --step extract
verist test --step extract --no-fail-on-diff
verist test --step extract --no-fail-on-commands-diff
```

| Option                       | Description                                 |
| ---------------------------- | ------------------------------------------- |
| `--step <name>`              | Step name to recompute                      |
| `--baseline <path>`          | Path to specific baseline file or directory |
| `--workflow <id>`            | Workflow identifier for auto-resolution     |
| `--version <ver>`            | Workflow version for auto-resolution        |
| `--no-fail-on-diff`          | Exit `0` even when value diffs are detected |
| `--no-fail-on-commands-diff` | Ignore command diffs for exit code          |

### Global Options

- `--debug` — show full error details
- `--quiet` — suppress non-essential output

## Peer Dependencies

- `@verist/core`
- `@verist/replay`

## License

[Apache-2.0](../../LICENSE)
