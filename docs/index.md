---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
title: "Verist  – Replay + diff for AI decisions"
description: "Deterministic, audit-first workflow kernel for production AI systems."

hero:
  name: "Verist"
  text: "Replay + diff for AI decisions"
  tagline: "Upgrade models and prompts without guessing what will break."
  actions:
    - theme: brand
      text: First Step
      link: /guides/first-step
    - theme: alt
      text: Mental Map
      link: /guides/mental-map
    - theme: alt
      text: Why Verist
      link: /why-verist
    - theme: alt
      text: Full Guide
      link: /getting-started

features:
  - title: Replay any decision
    details: Re-run past AI decisions from stored artifacts. Answer "why did this happen?" months later.
  - title: See what changes before shipping
    details: Recompute with new models or prompts and review exact diffs. No more silent regressions.
  - title: Human overrides that survive
    details: Manual corrections are preserved through recomputation. The system remembers your authority.
---

## Built for when AI decisions need to be

- **Reproduced** months later for an audit or investigation
- **Reviewed** by humans before going live
- **Safely recomputed** after model or prompt changes

## Mental model

```text
change prompt → recompute → see diff → approve → ship
```

Think of it as Git for AI decisions: inputs and artifacts are commits, recompute produces a reviewable diff, human overrides are explicit.

## How it differs

|                | Without Verist    | With Verist         |
| -------------- | ----------------- | ------------------- |
| Debugging      | Logs and guesses  | Exact replay        |
| Model upgrades | Re-run and hope   | Recompute + diff    |
| Human edits    | Lost on recompute | Preserved by design |
