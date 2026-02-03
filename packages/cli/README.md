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

### `verist diff`

Recompute baselines and show diffs (exploratory).

```bash
verist diff --step extract
verist diff --baseline .verist/baselines/extract/001.json
```

### `verist replay`

Inspect baselines and verify hash integrity.

```bash
verist replay --step extract
verist replay --step extract --verify
verist replay --baseline .verist/baselines/ --label "v2-prompt"
```

Use `--verify` to recompute hashes and check that stored content matches.

### `verist test`

Recompute baselines and fail on diffs (CI mode).

```bash
verist test --step extract
verist test --step extract --no-fail-on-commands-diff
```

### Global Options

- `--debug` — show full error details
- `--quiet` — suppress non-essential output

## Peer Dependencies

- `@verist/core`
- `@verist/replay`

## License

[Apache-2.0](../../LICENSE)
