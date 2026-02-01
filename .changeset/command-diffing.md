---
"@verist/replay": patch
---

Add first-class command diffing for control-flow change detection

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
