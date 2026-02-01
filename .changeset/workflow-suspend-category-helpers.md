---
"@verist/core": patch
---

Add `workflow.suspend()` for type-safe suspend commands and command category helpers

```typescript
const workflow = defineWorkflow({
  name: "claim-review",
  version: "1.0.0",
  steps: { handleDoc, verify },
});

// Type-safe suspend with compile-time resumeStep validation
commands: [
  workflow.suspend({
    reason: "awaiting_upload",
    checkpoint: { claimId },
    resumeStep: "handleDoc", // TS error if step doesn't exist
  }),
];

// Command category helpers for validation and assertions
import {
  isBlockingCommand,
  isControlCommand,
  isSideEffectCommand,
} from "@verist/core";

if (isBlockingCommand(cmd)) {
  // cmd is ReviewCommand | SuspendCommand
}
```

Also makes command Zod schemas strict to reject unknown keys.
