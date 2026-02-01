---
"@verist/core": minor
---

Add `workflow.review()` for type-safe review commands

```typescript
const workflow = defineWorkflow({
  name: "claim-review",
  version: "1.0.0",
  steps: { verify },
});

// Type-safe review command (symmetric with workflow.suspend())
commands: [
  workflow.review({
    reason: "high_risk_transaction",
    payload: { amount: 50000 },
  }),
];
```

This provides API symmetry with `workflow.suspend()` and encourages use of typed command builders over bare helpers.
