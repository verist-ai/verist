# SPEC: Batch Execution

Execute a step across multiple inputs with partial failure handling.

**Batch is a runner-level helper**, not a kernel primitive. It uses the same command semantics as single-step execution and must not invent new ones.

## Problem

Many workflows process collections (claims, files, recipients). Batch defines consistent semantics for mixed outcomes.

## Concepts

**Batch** — A collection of inputs processed by the same step, each as an independent run.

**Batch Result** — Collected outcomes: successes, failures, blocked items, and per-item details.

**Partial Failure** — Some items succeed while others fail; the batch completes with mixed results.

**Failure Policy** — Rules for stopping early or continuing.

## Design Principles

1. Partial success is normal
2. Results are structured (per-item details)
3. Concurrency is bounded
4. Batch reports truth, not policy (no retries, no thresholds)

## Types

```typescript
interface BatchOptions<TItem> {
  concurrency?: number; // default: 10
  failurePolicy?: "continue" | "abort";
  itemKey?: (item: TItem, index: number) => string | undefined;
}

interface BatchResult<TInput, TDelta, TError = StepError> {
  batchId: string;
  total: number;
  succeeded: number;
  failed: number;
  blocked: number;
  skipped: number;
  aborted: boolean;
  results: ItemResult<TInput, TDelta, TError>[];
}

interface ItemResult<TInput, TDelta, TError = StepError> {
  index: number;
  itemKey?: string;
  runId: string;
  input: TInput;
  status: "succeeded" | "failed" | "blocked" | "skipped";
  delta?: TDelta;
  events?: AuditEvent[];
  commands?: Command[];
  error?: TError;
  durationMs: number;
  blockedBy?: "review" | "suspend"; // Present when status is "blocked"
}
```

## Semantics

- **Item isolation:** Each item executes as an independent run with distinct `runId`
- **runId derivation:** `${batchId}::${itemKey}` if `itemKey` provided, else `${batchId}::${index}`
- **itemKey contract:** Must be stable, unique within the batch, and must not contain `::`. Batch validates uniqueness at start and fails fast on duplicates or reserved delimiter
- **batchId:** Grouping tag for observability, not structural hierarchy (no parent/child)
- **Counts invariant:** `succeeded + failed + blocked + skipped === total`
- **Ordering:** `results` returned in input order
- **Abort:** Stops scheduling new items; in-flight executions complete normally
- **Abort (failurePolicy: "abort"):** Batch stops scheduling after the first item reaches terminal `failed` state. Blocked items do not trigger abort.
- **Blocked:** Items that return barrier commands (`review` or `suspend`) are marked `blocked`. Query suspension records by `runId`.
- **Skipped:** Applies only to items that were never started due to abort.

## API

### Running a Batch

```typescript
import { runBatch } from "@verist/batch";

const result = await runBatch({
  step: verifyClaim,
  items: claims.map((c) => ({ claimId: c.id })),
  contextFactory,
  workflowId: "claim-verification",
  workflowVersion: "1.0.0",
  options: {
    concurrency: 5,
    failurePolicy: "continue",
    itemKey: (item) => item.claimId,
  },
});
```

### Failure Policies

| Policy     | Behavior                                              |
| ---------- | ----------------------------------------------------- |
| `continue` | Process all items regardless of failures              |
| `abort`    | Stop scheduling after first failure; finish in-flight |

## Non-Goals (v1)

- **Retries:** Runner/orchestrator responsibility, not batch
- **Thresholds:** Product policy, not execution primitive
- **Timing semantics:** Out of scope for batch helper

See ADR-006 for command categories and SPEC-suspend for resume semantics.
