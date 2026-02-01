# Reference Runner

Verist does not ship an orchestrator. This is a minimal runner loop to show where the kernel fits.

::: info
This is **not** production-grade. It is a reference for wiring.
:::

## What the runner does

1. Load state
2. Run a step
3. Commit delta + events
4. Enqueue commands
5. Capture artifacts

## Minimal loop

```ts
import { run } from "@verist/core";
import { createSnapshotFromResult } from "@verist/replay";

for (;;) {
  const job = await queue.take();
  if (!job) continue;

  const { step, input, identity } = job;
  const extraArtifacts = [];

  const result = await run(step, input, {
    adapters,
    workflowId: identity.workflowId,
    workflowVersion: identity.workflowVersion,
    runId: identity.runId,
    onArtifact: (artifact) => {
      if (
        artifact.kind !== "step-output" &&
        artifact.kind !== "step-commands"
      ) {
        extraArtifacts.push(artifact);
      }
    },
  });

  if (!result.ok) {
    await store.recordFailure(result.error);
    continue;
  }

  await store.commit({
    workflowId: result.value.workflowId,
    runId: result.value.runId,
    stepId: result.value.stepName,
    expectedVersion: await store.currentVersion(result.value.runId),
    delta: result.value.output.delta,
    events: result.value.output.events,
  });

  for (const cmd of result.value.output.commands ?? []) {
    await queue.enqueue(cmd);
  }

  const snapshot = await createSnapshotFromResult(result.value, {
    captureCommands: true,
    artifacts: extraArtifacts,
  });

  await snapshotStore.save(snapshot);
}
```

## Notes

- Capture artifacts only if you need replay/recompute
- `captureCommands` is required if you want `commandsDiff` later
- Keep state in your DB; the kernel is stateless by design

See [Anti-Patterns](./anti-patterns) for common mistakes to avoid when building a runner.
