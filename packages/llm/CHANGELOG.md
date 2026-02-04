# @verist/llm

## 0.0.9

### Patch Changes

- Updated dependencies [eab0dd8]
  - @verist/core@0.0.8

## 0.0.8

### Patch Changes

- Updated dependencies [61aba83]
  - @verist/core@0.0.7

## 0.0.7

### Patch Changes

- 1ce7f88: Add Anthropic provider adapter with cross-provider hash equivalence
  - `createAnthropic()` replaces placeholder stub with full implementation
  - System messages extracted into Anthropic's `system` parameter
  - Error mapping (429 → rate_limit, 401 → invalid_request, 5xx → provider_error)
  - Output hash normalized to same shape as OpenAI adapter for cross-provider comparison

## 0.0.6

### Patch Changes

- dbed3be: Add `onArtifact` callback to `complete()` for emitting `llm-input` and `llm-output` artifacts

## 0.0.5

### Patch Changes

- b5814f0: Widen `OpenAIClientLike.create` param type to accept OpenAI SDK's overloaded method signatures

## 0.0.4

### Patch Changes

- 98a4883: Use shared `stableStringify` from @verist/core for consistency across packages
- Updated dependencies [98a4883]
- Updated dependencies [119e0b0]
  - @verist/core@0.0.6

## 0.0.3

### Patch Changes

- e23e0b2: Add OpenAI adapter with trace hashing for replay detection
