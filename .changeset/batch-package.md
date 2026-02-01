---
"@verist/batch": minor
---

New package: Batch execution for Verist workflow steps

```typescript
import { runBatch } from "@verist/batch";

const result = await runBatch({
  step: processItem,
  items: documents,
  contextFactory,
  workflowId: "process-batch",
  workflowVersion: "1.0.0",
  options: {
    concurrency: 5,
    failurePolicy: "continue",
    itemKey: (doc) => doc.id,
  },
});

// result.succeeded, result.failed, result.blocked, result.skipped
// result.results[i].runId = `${batchId}::${itemKey}`
```

Key features:

- Worker pool with configurable concurrency (default: 10)
- Failure policies: `continue` or `abort`
- Items returning barrier commands (`review`/`suspend`) marked as `blocked`
- Results in input order with typed `input: TInput`
- Stable `runId` format: `${batchId}::${itemKey}` for replay correlation
