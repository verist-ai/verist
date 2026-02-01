# @verist/replay

## 0.0.4

### Patch Changes

- 400e584: Add first-class command diffing for control-flow change detection

  **Breaking:** `RecomputeResult.diff` renamed to `deltaDiff` to distinguish from new `commandsDiff`.

  ```typescript
  const { deltaDiff, commandsDiff } = await recompute(snapshot, step, ctx);

  if (commandsDiff && !commandsDiff.equal) {
    console.log("Control flow changed:", formatDiff(commandsDiff));
  }
  ```

  New features:
  - `step-commands` artifact kind for explicit command capture
  - `normalizeCommands()` for consistent command hashing (order-independent)
  - `captureCommands` option in `createSnapshotFromResult()` to enable command diffing
  - `commandsHashOnly` option for compliance mode

- Updated dependencies [400e584]
  - @verist/core@0.0.4

## 0.0.3

### Patch Changes

- 0a227ce: Simplify replay API and improve diff semantics

  ### Breaking changes
  - Replace `replay()` with `loadOutput()` — simpler retrieval without re-execution
  - Remove `createReplayContext` and related types (`ReplayContext`, `ReplayResult`)
  - Rename `RecomputeResult.artifact` to `outputArtifact`
  - `RecomputeResult.diff` is now `undefined` when original unavailable (hash-only or missing)
  - `compareSnapshots` returns `deltaDiff` instead of `outputDiff`
  - `recompute()` and `compareSnapshots()` now diff delta only, not events
  - Rename `hashOnly` to `outputHashOnly` in `createSnapshotFromResult` options
  - Remove `GetArtifact` type export

  ### New features
  - `loadOutput()` verifies hash integrity before returning content
  - `hashWithContent(value)` returns both hash and serialized content
  - Export `ArtifactKind` type with documentation
  - `recompute()` accepts `captureArtifacts: { hashOnly: true }` for compliance

  ### Improvements
  - Deterministic diff ordering (sorted keys)
  - `applyDiff` validates array index types to prevent silent NaN corruption
  - `applyDiff` throws on invalid paths (mismatched base structure)
  - Use `node:crypto` instead of `Bun.CryptoHasher` for broader runtime support
  - Extract `stableStringify` to shared module for consistent serialization
