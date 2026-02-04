---
"@verist/core": patch
---

Add `adapters` type hint field to `defineStep()` for adapter inference

`StepConfig` now accepts an optional `adapters` phantom field that lets TypeScript infer custom adapter types without manual `ctx` annotation.

```ts
defineStep({
  name: "extract",
  input: z.object({ text: z.string() }),
  delta: z.object({ title: z.string() }),
  adapters: {} as { llm: LLMProvider },
  run: async (input, ctx) => {
    ctx.adapters.llm; // fully typed
  },
});
```
