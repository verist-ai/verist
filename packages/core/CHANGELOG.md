# @verist/core

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
