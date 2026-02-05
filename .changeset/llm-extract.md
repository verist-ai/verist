---
"@verist/llm": patch
---

Add `extract()` helper for structured LLM data extraction

Combines `complete()` → JSON.parse → schema.parse into a single call with `Result`-based error handling. Uses a generic `{ parse }` schema interface (works with Zod, ArkType, or custom validators). Strips ` ```json ``` ` fences automatically. Error codes distinguish `json_error` (non-JSON response) from `schema_error` (valid JSON, wrong shape) for retry policies.
