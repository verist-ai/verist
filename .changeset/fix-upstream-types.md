---
"@verist/core": patch
"@verist/replay": patch
---

Fix type inference issues: wrap `run()` input with `NoInfer` to prevent `z.enum()` literal widening, add `TAdapters` generic to `recompute()`, and fix invalid `as const` JSDoc example
