---
"@verist/core": patch
"@verist/replay": patch
"@verist/cli": patch
---

Simplify adapter and options ergonomics across `run()` and `recompute()`

- Remove phantom `adapters` field from `defineStep()` — adapter types are now inferred from `ctx` parameter annotation on `run`
- Make `adapters` optional in `run()` when step has no adapters; the entire options arg is omissible
- Always collect artifacts in `result.value.artifacts` (previously required `onArtifact` callback)
- `recompute()` accepts adapters directly and derives workflow metadata from the snapshot, removing manual `createContextFactory` double-call
