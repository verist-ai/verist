# Overview

Verist is a deterministic workflow kernel for AI systems — replay + diff for AI decisions.

## What Verist Is

- Trust kernel, not an agent framework
- LLMs as controlled transformers, not autonomous agents
- Explicit, database-backed state — nothing in memory
- Artifact-based replay and recompute with diff

## Non-Goals

- Chat framework or conversational UX
- Autonomous agents / agent playground
- Runtime or orchestrator
- Fast prototyping or "AI magic"

## Core Principles

1. **LLM ≠ truth** — LLMs extract/transform, external sources verify
2. **Explicit state** — All state in database, queue messages are pointers
3. **Idempotent steps** — Safe to retry, natural keys for deduplication
4. **Audit-first** — Every LLM call logged with inputs, outputs, model version
5. **Diff over silent change** — recomputation produces reviewable diffs
6. **Human authority** — overrides are preserved, not overwritten

## Code Conventions

- TypeScript, Zod for schemas
- Pure functions where possible
- No implicit state or singletons
- Errors as values (Result type), not exceptions for expected failures

## API Design

- Minimal surface: `defineWorkflow`, `defineStep`, `runStep`
- Steps receive input, return output + audit events
- No magic — explicit wiring over convention

## Testing

Uses Bun's built-in test runner (`bun test`).

### Test File Naming

| Pattern         | Purpose           | Location              |
| --------------- | ----------------- | --------------------- |
| `*.test.ts`     | Unit tests        | Colocated with source |
| `*.int.test.ts` | Integration tests | `tests/` directory    |
| `*.e2e.test.ts` | End-to-end tests  | `tests/` directory    |
| `*.bench.ts`    | Benchmarks        | Colocated or `bench/` |

### Structure

```
packages/core/src/
  result.ts
  result.test.ts      # colocated unit test
  step.ts
  step.test.ts
tests/                # package-level integration tests
  workflow.int.test.ts
```

Unit tests are colocated with source files for discoverability and clear ownership.
Integration tests that span modules go in a separate `tests/` directory.

## Documentation

- **ADRs** `docs/adr/NNN-name.md` — Architectural decisions (reference as ADR-NNN)
- **SPECs** `docs/specs/name.md` — Component specifications (reference as SPEC-name)
