# @verist/llm

[![npm version](https://badge.fury.io/js/@verist%2Fllm.svg)](https://badge.fury.io/js/@verist%2Fllm)
[![npm downloads](https://img.shields.io/npm/dm/@verist/llm.svg)](https://npmjs.com/package/@verist/llm)
[![Ask ChatGPT](https://img.shields.io/badge/Ask_ChatGPT-10a37f?logo=google+gemini&logoColor=white)](https://chatgpt.com/g/g-697e23b923088191b8cb315bebf14a3b-verist-architect)
[![Twitter Follow](https://img.shields.io/twitter/follow/verist_ai?style=social)](https://x.com/verist_ai)

LLM provider adapters with built-in tracing for audit events.

## Why

Every LLM call in Verist workflows should be traceable. This package wraps provider SDKs to automatically capture:

- Model version and token usage
- Input/output hashes for replay detection
- Duration and raw request/response (optional)
- Structured errors with retry hints

The trace attaches directly to audit events, so you can answer "what did the model see and return?" months later.

## Install

```bash
bun add @verist/llm openai
```

## Usage

```ts
import OpenAI from "openai";
import { createOpenAI, llmEvent } from "@verist/llm";

const llm = createOpenAI({
  client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
});

const result = await llm.complete({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Summarize this document..." }],
});

if (result.ok) {
  console.log(result.value.content);
  // Attach trace to audit event
  const event = llmEvent("summary_created", result.value);
}
```

## API

### `createOpenAI(config)`

Create an OpenAI provider adapter.

```ts
const llm = createOpenAI({
  client: openaiClient, // OpenAI SDK instance
  includeRawIO: true, // Embed raw request/response in trace (default: true)
});
```

### `LLMProvider.complete(request, opts?)`

Execute a completion request. Returns `Result<LLMResponse, LLMError>`.

```ts
interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
}

interface LLMCompleteOpts {
  /** Callback for emitting artifacts (llm-input, llm-output). */
  onArtifact?: OnArtifact;
}

interface LLMResponse {
  content: string;
  trace: LLMTrace;
}
```

When `onArtifact` is provided, the adapter emits `llm-input` and `llm-output` artifacts on success (input before output). Not called on errors.

### `llmEvent(type, response, payload?)`

Create an audit event from an LLM response with trace attached.

```ts
const event = llmEvent("extraction_complete", response, { documentId: "123" });
// => { type: "extraction_complete", payload: {...}, llmTrace: {...} }
```

### `LLMTrace`

Trace metadata captured with every successful completion:

```ts
interface LLMTrace {
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  inputHash: string; // sha256 of request params
  outputHash: string; // sha256 of response content
  input?: unknown; // raw request (if includeRawIO)
  output?: unknown; // raw response (if includeRawIO)
}
```

### Error Handling

Errors are returned as values, not thrown:

```ts
const result = await llm.complete(request);

if (!result.ok) {
  const { code, message, retryable } = result.error;
  // code: "rate_limit" | "context_length" | "invalid_request" | "provider_error"
}
```

### `createAnthropic(config)`

Create an Anthropic provider adapter.

```ts
import Anthropic from "@anthropic-ai/sdk";
import { createAnthropic } from "@verist/llm";

const llm = createAnthropic({
  client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  includeRawIO: true, // Embed raw request/response in trace (default: true)
});

const result = await llm.complete({
  model: "claude-sonnet-4-20250514",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Summarize this document..." },
  ],
});
```

System messages are automatically extracted and passed as Anthropic's `system` parameter.

## Bring Your Own Client

The adapters use structural typing — no direct dependency on `openai` or `@anthropic-ai/sdk`. You provide a configured client instance:

```ts
import OpenAI from "openai";

// Configure as needed (custom base URL, headers, etc.)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://api.openai.com/v1",
});

const llm = createOpenAI({ client });
```

This works with any OpenAI-compatible API (Azure OpenAI, local proxies, etc.).

## License

[Apache-2.0](../../LICENSE)
