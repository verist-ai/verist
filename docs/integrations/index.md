# Integrations

Verist wraps AI tools – it doesn't replace them.

## How it works

Any external tool – LLM provider, extraction library, classifier – runs inside a `defineStep`. Verist captures artifacts, enables replay, and produces diffs when you recompute with a new model or prompt.

```text
your tool (extraction, classification, generation)
        ↓
  defineStep({ run })   ← Verist wraps the call
        ↓
  artifacts captured    ← input, output, events logged
        ↓
  recompute + diff      ← see what changed after a model upgrade
```

## What Verist adds

| Concern                 | Your tool provides         | Verist adds                        |
| ----------------------- | -------------------------- | ---------------------------------- |
| **Extraction quality**  | Prompts, models, grounding | –                                  |
| **Replay**              | –                          | Reproduce past runs from artifacts |
| **Diff**                | –                          | See exactly what changed           |
| **Audit trail**         | –                          | Structured events per execution    |
| **Human overrides**     | –                          | Overlay layer survives recompute   |
| **Identity-aware diff** | –                          | `keyBy` for stable array matching  |

## Available integrations

- [LangExtract](./langextract.md) – structured extraction with source grounding

More integrations coming soon. Any tool that runs inside a step gets replay and diff automatically.
