---
"@verist/replay": patch
---

**BREAKING:** Convert hash and artifact functions to async (Web Crypto API)

Migrate from `node:crypto` to Web Crypto API for cross-platform support (Node 20+, Bun, Deno, browsers).

- `hashValue()` → `async hashValue()`
- `hashWithContent()` → `async hashWithContent()`
- `captureArtifact()` → `async captureArtifact()`
- `createSnapshot()` → `async createSnapshot()`
- `createSnapshotFromResult()` → `async createSnapshotFromResult()`
