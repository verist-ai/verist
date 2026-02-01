# @verist/storage-pg

[![npm version](https://badge.fury.io/js/@verist%2Fstorage-pg.svg)](https://badge.fury.io/js/@verist%2Fstorage-pg)
[![npm downloads](https://img.shields.io/npm/dm/@verist/storage-pg.svg)](https://npmjs.com/package/@verist/storage-pg)
[![Ask ChatGPT](https://img.shields.io/badge/Ask_ChatGPT-10a37f?logo=google+gemini&logoColor=white)](https://chatgpt.com/g/g-697e23b923088191b8cb315bebf14a3b-verist-architect)
[![Twitter Follow](https://img.shields.io/twitter/follow/verist_ai?style=social)](https://x.com/verist_ai)

Postgres adapter for Verist storage interfaces.

## Quick Start

### Drizzle (Recommended)

```bash
npm install @verist/storage-pg drizzle-orm pg
```

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

```typescript
// src/db/schema.ts
export { veristState, veristEvents } from "@verist/storage-pg/schema";
// ...your other tables
```

```bash
npx drizzle-kit push
```

```typescript
// Usage
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createPgRunStore } from "@verist/storage-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);
const store = createPgRunStore({ db });

// Commit step result (state + events atomically)
await store.commit({
  workflowId: "verify-document",
  runId: "run-123",
  stepId: "extract",
  expectedVersion: 0, // Must be 0 for new runs
  delta: { claims: extractedClaims },
  events: [
    {
      type: "extraction_completed",
      payload: { count: extractedClaims.length },
    },
  ],
});
```

### Raw SQL

Copy `schema.sql` to your migration tool (dbmate, Flyway, etc.) and apply.

```bash
# Example with dbmate
cp node_modules/@verist/storage-pg/schema.sql db/migrations/001_verist.sql
dbmate up
```

## Scope

This adapter provides:

- `RunStore` implementation (`load`, `commit`, `setOverlay`)
- Reference schema for Postgres
- Atomic commits (state + events in transaction)

This adapter does NOT provide:

- Multi-tenant isolation (add RLS in your app)
- Custom partitioning (tune for your workload)
- Migration tooling (use Drizzle or your preferred tool)
- Custom indexes beyond the basics (add based on your query patterns)

For advanced Postgres setups, use this as a starting point and customize.

## Storage Contract

### Atomic Commits

`commit()` writes state delta and events in a single transaction:

- Either both succeed or both fail
- Events are always attributed to the `stepId`
- No "audit drift" (state without events or vice versa)

### Concurrency

- `commit()` uses optimistic locking via `expectedVersion`
- First commit must have `expectedVersion: 0`
- Returns `conflict` if version mismatch or if run already exists when `expectedVersion: 0`
- Returns `not_found` if `expectedVersion > 0` but run doesn't exist
- Version increments on each successful `commit()`

### Overlay (Human Corrections)

- `setOverlay()` is last-write-wins (no versioning)
- Does not increment `version`
- Overlay values take precedence over computed via `effectiveState()`

### Merge Semantics

- Shallow merge only (JSONB `||` operator)
- No key deletion (use explicit tombstone values if needed)
- Nested objects are replaced, not deep-merged

### Data Types

- `version`: INTEGER (not BIGINT - avoids JS precision issues)
- `id` (events): BIGSERIAL mapped to string in application code
- Timestamps: TIMESTAMPTZ (timezone-aware)
- State fields: JSONB (schema-free, validated at application layer)

### Retention / Compliance

- `llmTrace.input` and `llmTrace.output` may be omitted (hashes are mandatory per kernel invariant #8)
- Events are append-only (never UPDATE/DELETE)
- This enables "hash-only mode" for regulated environments

## Design Notes

### Why no runs table?

In Verist, `(workflow_id, run_id)` is the identity. State is the run.

Unlike Temporal or Airflow where runs have separate lifecycle metadata, Verist treats the state record as canonical. The `workflow_id` + `run_id` composite key is sufficient for:

- Loading state
- Correlating events
- Replay targeting

If you need run-level metadata (created_by, tags, priority), add it to your workflow's state schema or create a separate table in your app. This keeps the storage layer minimal and lets you model runs however your domain requires.

### Why JSONB for state?

JSONB allows schema-free state evolution without migrations. Your workflow state schema is validated by Zod at runtime; the database stores whatever passes validation.

Trade-off: No database-level schema enforcement. If you need stricter guarantees, consider adding CHECK constraints or using a typed column approach.

### Why atomic commits?

A trust kernel must guarantee that state and audit events are consistent. Separate `apply()` and `append()` calls could fail independently, creating:

- State advanced but missing events
- Events written but state rejected (version conflict)

The `commit()` primitive solves this by using a database transaction.

## License

[Apache-2.0](../../LICENSE)
