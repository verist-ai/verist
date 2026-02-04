---
"@verist/storage": patch
---

Accept interfaces in `effectiveState<T>()`

Changed type constraint from `T extends Record<string, unknown>` to `T extends object`. TS interfaces lack implicit index signatures, so `Record<string, unknown>` rejected them at call sites.
