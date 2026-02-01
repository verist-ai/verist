---
"@verist/core": patch
---

Add artifact capture hook for step execution auditing

- Add `onArtifact` callback to `ExecutionMetadata` and `StepContext`
- Core `run()` emits `step-output` artifact when callback is provided
- Export `Artifact`, `OnArtifact`, `stableStringify`, `hashValue`, `createArtifact` from new `artifact.ts`
