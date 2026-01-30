# Contributing to Verist

## Setup

```bash
git clone https://github.com/verist-ai/verist.git
cd verist
bun install
```

## Development

```bash
bun test              # run all tests
bun test --watch      # watch mode
bun run build         # build all packages
```

## Code Style

- TypeScript with Zod for schemas
- Pure functions where possible
- Errors as values (`Result` type), not exceptions for expected failures
- No implicit state or singletons

Format with Prettier before committing:

```bash
bunx prettier --write .
```

## Testing

Tests use Bun's built-in test runner.

| Pattern         | Purpose           | Location              |
| --------------- | ----------------- | --------------------- |
| `*.test.ts`     | Unit tests        | Colocated with source |
| `*.int.test.ts` | Integration tests | `tests/` directory    |

Unit tests live next to their source files. Integration tests that span modules go in `tests/`.

## Pull Requests

1. Fork and create a feature branch
2. Write tests for new functionality
3. Run `bun test` and `bunx prettier --check .`
4. Open a PR with a clear description of what and why

Keep PRs focused. One concern per PR.

## Architecture Decisions

Significant decisions are recorded as ADRs in `docs/adr/`. Use the template at `docs/adr/000-template.md`.

Reference existing ADRs when relevant:

- ADR-001: Determinism
- ADR-002: Commands
- ADR-003: State layers
- ADR-004: Replay semantics

## Questions

Open an issue for bugs, feature requests, or questions.
