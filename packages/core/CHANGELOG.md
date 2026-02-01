# @verist/core

## 0.0.5

### Patch Changes

- 8dc5b5b: Add `workflow.review()` for type-safe review commands

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

### Patch Changes

- 954aa58: Add `suspend` command for pausing workflows until external input arrives

  ```typescript
  import { suspend } from "@verist/core";

  commands: [
    suspend({
      reason: "awaiting_documentation",
      checkpoint: { claimId },
      resumeStep: "handleDocumentation",
    }),
  ];
  ```

  Unlike `review` (human approval gate), `suspend` waits for data/callbacks. Sibling commands are discarded — the resumed step emits fresh commands.

- 954aa58: Add `workflow.suspend()` for type-safe suspend commands and command category helpers

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

## 0.0.4

### Patch Changes

- 400e584: Add `suspend` command for pausing workflows until external input arrives

  ```typescript
  import { suspend } from "@verist/core";

  commands: [
    suspend({
      reason: "awaiting_documentation",
      checkpoint: { claimId },
      resumeStep: "handleDocumentation",
    }),
  ];
  ```

  Unlike `review` (human approval gate), `suspend` waits for data/callbacks. Sibling commands are discarded — the resumed step emits fresh commands.

## 0.0.3

### Patch Changes

- 0f04aff: Add `suspend` command for pausing workflows until external input arrives

  ```typescript
  import { suspend } from "@verist/core";

  commands: [
    suspend({
      reason: "awaiting_documentation",
      checkpoint: { claimId },
      resumeStep: "handleDocumentation",
    }),
  ];
  ```

  Unlike `review` (human approval gate), `suspend` waits for data/callbacks. Sibling commands are discarded — the resumed step emits fresh commands.
