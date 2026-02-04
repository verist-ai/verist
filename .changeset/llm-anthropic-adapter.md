---
"@verist/llm": patch
---

Add Anthropic provider adapter with cross-provider hash equivalence

- `createAnthropic()` replaces placeholder stub with full implementation
- System messages extracted into Anthropic's `system` parameter
- Error mapping (429 → rate_limit, 401 → invalid_request, 5xx → provider_error)
- Output hash normalized to same shape as OpenAI adapter for cross-provider comparison
