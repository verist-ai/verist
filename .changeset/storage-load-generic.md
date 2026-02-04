---
"@verist/storage": patch
"@verist/storage-pg": patch
---

Add generic type parameter to `RunStore.load<T>()`

`load<T>()` now accepts a type parameter like `commit<T>()` and `setOverlay<T>()`, returning `StateSnapshot<T>` instead of `StateSnapshot<unknown>`. Eliminates manual casts at call sites.

```ts
const snap = await store.load<MyState>(workflowId, runId);
snap.value!.computed.score; // typed
```
