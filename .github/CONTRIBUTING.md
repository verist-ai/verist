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

## Developer Certificate of Origin (DCO)

This project uses the Developer Certificate of Origin (DCO) version 1.1.

By contributing, you certify that:

- You wrote the contribution yourself, or
- You have the right to submit it under the Apache License, Version 2.0, and
- You agree to license it under the Apache License, Version 2.0.

The full text of the DCO is available at: https://developercertificate.org/

All commits must be signed off to indicate acceptance of the DCO:

```bash
git commit -s -m "your message"
```

If you are contributing on behalf of an employer, you confirm that you are authorized to submit this work under the above terms.

**Note:** Contributions that are not signed off may be rejected by automated checks.

## AI-Assisted Contributions

AI-assisted development tools may be used to help produce contributions.

By submitting a contribution, you certify that you have reviewed and understand the code and that, to the best of your knowledge, it does not include material you do not have the right to submit under the Apache License, Version 2.0.

The use of AI tools does not change the requirements of the DCO. The contributor remains the author of record and responsible for the contribution.

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
