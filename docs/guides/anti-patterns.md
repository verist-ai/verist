# Anti-Patterns

These patterns break Verist's guarantees. Avoid them.

## Hidden state in steps

::: danger Don't

```ts
let cache = {}; // module-level state

const step = defineStep({
  run: async (input, ctx) => {
    if (cache[input.id]) return cache[input.id]; // [!code error]
    const result = await ctx.adapters.llm.run(input);
    cache[input.id] = result;
    return { delta: result, events: [] };
  },
});
```

:::

::: tip Do
Pass all required data through input or adapters. State lives in the database, not in memory.
:::

**Why it breaks:** Replay and recompute assume the step has no memory between runs. Hidden state makes outputs non-reproducible.

## Writing to the database inside steps

::: danger Don't

```ts
const step = defineStep({
  run: async (input, ctx) => {
    await db.insert({ id: input.id, status: "processed" }); // [!code error]
    return { delta: { processed: true }, events: [] };
  },
});
```

:::

::: tip Do
Return a delta. Let your runner commit it atomically after the step completes.
:::

**Why it breaks:** If the step fails after the write, you have partial state. Replay becomes impossible.

## Retries inside steps

::: danger Don't

```ts
const step = defineStep({
  run: async (input, ctx) => {
    for (let i = 0; i < 3; i++) {
      // [!code error]
      try {
        return await riskyCall(input);
      } catch (e) {
        continue;
      }
    }
    throw new Error("Failed after retries");
  },
});
```

:::

::: tip Do
Let the runner handle retries. Steps should fail fast and return errors as values.
:::

**Why it breaks:** Internal retries hide failure modes. The audit trail shows success even though three attempts happened.

## Side effects in steps

::: danger Don't

```ts
const step = defineStep({
  run: async (input, ctx) => {
    await sendEmail(input.userId, "Your request was processed"); // [!code error]
    return { delta: { notified: true }, events: [] };
  },
});
```

:::

::: tip Do
Return an `emit` command. Let your runner send the email after the step commits.
:::

**Why it breaks:** If the step is replayed or recomputed, the email is sent again. Side effects should be explicit commands interpreted by your runner.

## Ignoring commands

::: danger Don't

```ts
const result = await run(step, input, ctx);
if (result.ok) {
  await store.commit(result.value.output.delta);
  // commands silently dropped // [!code error]
}
```

:::

::: tip Do
Interpret every command. Use your queue for `invoke`, your review system for `review`, your event bus for `emit`.
:::

**Why it breaks:** Commands represent intended control flow. Dropping them means the workflow stalls silently.

## Mixing computed and overlay writes

::: danger Don't

```ts
const step = defineStep({
  run: async (input, ctx) => {
    await store.writeOverlay({ score: 0.95 }); // [!code error]
    return { delta: { score: 0.85 }, events: [] };
  },
});
```

:::

::: tip Do
Steps write to computed (via delta). Only your review UI writes to overlay.
:::

**Why it breaks:** The overlay is for human overrides. If steps write to it, human decisions can be silently overwritten.

## Silent recompute

::: danger Don't

```ts
const result = await recompute(snapshot, step, newCtx);
if (result.ok) {
  await store.commit(result.value.newOutput.delta); // [!code error]
}
```

:::

::: tip Do
Show the diff to a reviewer. Only persist after explicit approval.
:::

**Why it breaks:** Recompute is for seeing what _would_ change. Persisting without review defeats the purpose.

## Capturing too little

::: danger Don't

```ts
const result = await run(step, input, {
  adapters,
  // no onArtifact callback // [!code error]
});
```

:::

::: tip Do
Capture all non-deterministic inputs/outputs via `onArtifact`. Store them with your snapshot.
:::

**Why it breaks:** Replay only works if you have all the artifacts. Missing artifacts mean approximate replay at best.

## Summary

| Anti-pattern          | Consequence                 |
| --------------------- | --------------------------- |
| Hidden state          | Non-reproducible outputs    |
| DB writes in steps    | Partial state on failure    |
| Retries in steps      | Hidden failure modes        |
| Side effects in steps | Duplicate effects on replay |
| Ignoring commands     | Silent workflow stalls      |
| Steps writing overlay | Human overrides lost        |
| Silent recompute      | Unreviewed changes          |
| Missing artifacts     | Approximate replay          |
