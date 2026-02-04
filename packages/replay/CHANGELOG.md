# @verist/replay

## 0.0.13

### Patch Changes

- eab0dd8: Fix type inference issues: wrap `run()` input with `NoInfer` to prevent `z.enum()` literal widening, add `TAdapters` generic to `recompute()`, and fix invalid `as const` JSDoc example
- Updated dependencies [eab0dd8]
  - @verist/core@0.0.8

## 0.0.12

### Patch Changes

- Updated dependencies [61aba83]
  - @verist/core@0.0.7

## 0.0.11

### Patch Changes

- 35ef0de: Add `strictOutput` option to `recompute()` for full delta schema validation

  When `{ validate: true, strictOutput: true }`, output is validated against the full `deltaSchema` instead of the partial schema. Catches missing required top-level fields that `.partial()` would silently allow.

## 0.0.10

### Patch Changes

- 1ce7f88: Add recompute status classification and observational schema validation
  - `RecomputeResult` now includes `status` (`clean` | `value_changed` | `schema_violation`), `comparable`, `parsedDelta`, and `schemaViolations` fields
  - Schema validation is observational — populates `schemaViolations` instead of returning `err(OUTPUT_VALIDATION)`
  - When validation succeeds, Zod-parsed delta is used for diffing (reflects defaults/coercions)
  - `diff()` treats non-plain objects (Date, Map, etc.) as opaque values
  - Export `formatPath` and `SchemaViolation`, `RecomputeStatus` types

## 0.0.9

### Patch Changes

- ab51d5f: Add recompute status classification and observational schema validation
  - `RecomputeResult` now includes `status` (`clean` | `value_changed` | `schema_violation`), `comparable`, `parsedDelta`, and `schemaViolations` fields
  - Schema validation is observational — populates `schemaViolations` instead of returning `err(OUTPUT_VALIDATION)`
  - When validation succeeds, Zod-parsed delta is used for diffing (reflects defaults/coercions)
  - `diff()` treats non-plain objects (Date, Map, etc.) as opaque values
  - Export `formatPath` and `SchemaViolation`, `RecomputeStatus` types

## 0.0.8

### Patch Changes

- f6b283f: Add reserved artifact kind validation and optional schema validation in recompute

## 0.0.7

### Patch Changes

- b5814f0: Add `@verist/replay/quickstart` subpath with `capture`, `recompute`, and `diff` helpers for minimal getting-started examples

## 0.0.6

### Patch Changes

- 98a4883: **BREAKING:** Convert hash and artifact functions to async (Web Crypto API)

  Migrate from `node:crypto` to Web Crypto API for cross-platform support (Node 20+, Bun, Deno, browsers).
  - `hashValue()` → `async hashValue()`
  - `hashWithContent()` → `async hashWithContent()`
  - `captureArtifact()` → `async captureArtifact()`
  - `createSnapshot()` → `async createSnapshot()`
  - `createSnapshotFromResult()` → `async createSnapshotFromResult()`

- Updated dependencies [98a4883]
- Updated dependencies [119e0b0]
  - @verist/core@0.0.6

## 0.0.5

### Patch Changes

- 954aa58: Add first-class command diffing for control-flow change detection

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

- Updated dependencies [954aa58]
- Updated dependencies [8dc5b5b]
- Updated dependencies [954aa58]
  - @verist/core@0.0.5

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
