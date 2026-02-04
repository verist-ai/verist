---
"@verist/replay": patch
---

Add `strictOutput` option to `recompute()` for full delta schema validation

When `{ validate: true, strictOutput: true }`, output is validated against the full `deltaSchema` instead of the partial schema. Catches missing required top-level fields that `.partial()` would silently allow.
