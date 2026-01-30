# Changesets

Changeset files in this folder describe pending version bumps. Each `.md` file represents one change.

## Commands

```bash
bun run changeset     # Create a changeset (interactive)
bun run version       # Apply changesets → bump versions + generate changelogs
bun run release       # Build + publish to npm
```

## Creating a changeset

Run `bun run changeset` and answer:

1. Which packages changed? (space to select)
2. Semver bump type: `patch` (fix), `minor` (feature), `major` (breaking)
3. Summary of the change

This creates a file like `.changeset/purple-dogs-dance.md`:

```md
---
"@verist/core": minor
"@verist/replay": patch
---

Add diffEffectiveState helper for layered state comparison
```

## When to create changesets

- **Yes**: Bug fixes, new features, breaking changes, dependency updates affecting users
- **No**: Docs-only changes, internal refactors, test changes, CI updates

## Release workflow

```bash
# 1. Create changesets as you work
bun run changeset

# 2. When ready to release, apply changesets
bun run version
git add . && git commit -m "chore: release"

# 3. Publish
bun run release
git push --follow-tags
```

## Semver guidelines

| Change                             | Bump    | Example                         |
| ---------------------------------- | ------- | ------------------------------- |
| Bug fix                            | `patch` | Fix array removal order in diff |
| New feature (backwards compatible) | `minor` | Add createSnapshotFromResult    |
| Breaking change                    | `major` | Rename runStep to executeStep   |
| Dependency bump (non-breaking)     | `patch` | Update zod peer dep range       |

## Links

- [Changesets documentation](https://github.com/changesets/changesets)
- [Common questions](https://github.com/changesets/changesets/blob/main/docs/common-questions.md)
