# Human Overrides

Verist assumes humans can overrule AI output. Those decisions are not a side effect – they are state.

## Why this exists

You upgrade a model. Three past decisions change. A reviewer fixes one decision manually. You recompute again a week later – the human correction still wins.

```text
model v1 → computed = 0.42
human fix → overlay  = 0.90
model v2 → computed = 0.38
effective = 0.90  ← human override preserved
```

## The three-layer state model

| Layer         | Source                        |
| ------------- | ----------------------------- |
| **computed**  | What steps produce            |
| **overlay**   | Human corrections             |
| **effective** | `{ ...computed, ...overlay }` |

```ts
import { effectiveState } from "@verist/storage";

const effective = effectiveState(snapshot);
// equivalent to { ...snapshot.computed, ...snapshot.overlay }
```

Overlay always wins. Human corrections survive recompute.

```text
step → computed
review UI → overlay
recompute → computed updated, overlay unchanged
```

::: warning
Steps must never write to the overlay.
:::

## Why this matters

Without an overlay layer, you choose between:

- Keeping human edits, but losing recompute
- Recomputing, but losing human edits

Verist avoids that tradeoff.

## How to apply an override

Overrides are an external concern. Your UI or review tool writes them to the overlay layer in storage.

Typical flow:

1. Run a step and store the computed delta
2. Show the diff to a reviewer
3. If they override, write to overlay

## Design tips

- Use **small, targeted overrides** (single fields) instead of large patches
- Record a **reason** alongside the override
- Treat overrides as **audit events**
