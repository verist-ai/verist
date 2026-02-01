# SPEC: Batch Execution

Execute a step across multiple inputs with partial failure handling.

**Batch is a runner-level helper**, not a kernel primitive. It uses the same command semantics as single-step execution and must not invent new ones.

## Problem

Many workflows process collections (claims, files, recipients). Batch defines consistent semantics for mixed outcomes.

## Concepts

**Batch** — A collection of inputs processed by the same step, each as an independent run.

**Batch Result** — Collected outcomes: successes, failures, suspensions, and per-item details.

**Partial Failure** — Some items succeed while others fail; the batch completes with mixed results.

**Failure Policy** — Rules for stopping early or continuing.

## Design Principles

1. Partial success is normal
2. Results are structured (per-item details)
3. Concurrency is bounded

## Types

```typescript
interface BatchOptions<TItem = unknown> {
  concurrency?: number; // default: 10
  failurePolicy?: "continue" | "abort" | "abort-on-threshold";
  failureThreshold?: number; // for abort-on-threshold (0.0-1.0)
  retries?: number; // per-item retry count (default: 0)
  retryDelay?: number; // milliseconds between retries
  itemKey?: (item: TItem, index: number) => string | undefined; // stable key for runId derivation
}

interface BatchResult<TDelta, TError = StepError> {
  batchId: string;
  total: number;
  succeeded: number;
  failed: number;
  suspended: number;
  skipped: number; // not executed due to abort
  aborted: boolean;
  results: ItemResult<TDelta, TError>[];
}

interface ItemResult<TDelta, TError> {
  index: number;
  itemKey?: string;
  input: unknown;
  status: "succeeded" | "failed" | "suspended" | "skipped";
  delta?: TDelta;
  events?: AuditEvent[];
  error?: TError;
  suspensionId?: string; // If suspended, the suspension record ID
  retryCount?: number;
  durationMs: number;
}
```

## Semantics

- **Item isolation:** Each item executes as an independent run with distinct `runId`
- **runId derivation:** `${batchId}::${itemKey}` if `itemKey` provided, else `${batchId}::${index}`
- **itemKey contract:** Must be stable, unique within the batch, and must not contain `::`. Runner validates uniqueness at batch start and fails fast on duplicates or invalid characters
- **batchId:** Grouping tag for observability, not structural hierarchy (no parent/child)
- **Counts invariant:** `succeeded + failed + suspended + skipped === total`
- **Ordering:** `results` returned in input order
- **Abort:** `aborted` reflects actual early termination, regardless of configured `failurePolicy`. Stops scheduling new items; in-flight executions (including retries) complete normally
- **Abort (failurePolicy: "abort"):** Batch stops scheduling after the first item reaches terminal `failed` state, evaluated after retries are exhausted. Suspended items do not trigger abort.
- **Abort threshold:** Computed over completed items only (succeeded + failed); pending/suspended items are excluded. Threshold is evaluated after retries are exhausted for an item.
- **Suspension:** Items that suspend follow SPEC-suspend; query by runId pattern
- **Retries:** Apply only to transient failures (network, timeout, rate limits). Validation errors and schema mismatches are deterministic and do not retry. Suspended items do not retry. `retryDelay` specifies minimum milliseconds between retry attempts; delay handling is runner-defined.
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
  // batchId is optional; defaults to crypto.randomUUID()
  options: { concurrency: 5, failurePolicy: "continue" },
});
```

### Failure Policies

```typescript
{ failurePolicy: "continue" }
{ failurePolicy: "abort" }
{ failurePolicy: "abort-on-threshold", failureThreshold: 0.2 }
```

See SPEC-suspend for resume semantics when items suspend.
