---
"@verist/replay": patch
---

Add recompute status classification and observational schema validation

- `RecomputeResult` now includes `status` (`clean` | `value_changed` | `schema_violation`), `comparable`, `parsedDelta`, and `schemaViolations` fields
- Schema validation is observational — populates `schemaViolations` instead of returning `err(OUTPUT_VALIDATION)`
- When validation succeeds, Zod-parsed delta is used for diffing (reflects defaults/coercions)
- `diff()` treats non-plain objects (Date, Map, etc.) as opaque values
- Export `formatPath` and `SchemaViolation`, `RecomputeStatus` types
