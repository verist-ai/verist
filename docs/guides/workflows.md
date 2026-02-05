# Workflows

A workflow is a named bundle of steps with a version. It doesn't run by itself – your runner does.

## Why use a workflow

| Benefit          | Description                              |
| ---------------- | ---------------------------------------- |
| Stable identity  | Replay and audit tied to a consistent ID |
| Versioning       | Track model/prompt changes               |
| Type-safe wiring | Commands are validated at compile time   |

If you only have one step, skip this. The moment you compose steps, it's worth it.

## When to use what

| Use case                | Use       |
| ----------------------- | --------- |
| One-off call            | Bare step |
| Linear flow             | Pipeline  |
| Branching or fan-out    | Commands  |
| Audit + stable identity | Workflow  |

## Define a workflow

```ts
import { defineWorkflow } from "verist";

const workflow = defineWorkflow({
  name: "verify-document",
  version: "1.2.0",
  steps: { extract, verify, score },
});
```

## Type-safe commands

Use `workflow.invoke()` for type-checked step invocation:

```ts
commands: [workflow.invoke("verify", { documentId })],
```

This catches wiring errors before runtime.

## Running a workflow step

A workflow doesn't replace `run()`. You still call `run()` with a step, passing identity from the workflow:

```ts
const result = await run(
  workflow.getStep("extract"),
  { documentId },
  {
    adapters,
    workflowId: workflow.name,
    workflowVersion: workflow.version,
    runId: "run-42",
  },
);
```

## Versioning

- **Bump versions** when a model or prompt change could affect output
- **Keep versions stable** across deploys if behavior is unchanged
- **Use semver** if that matches your release process

## Runner obligations by command

Commands are data. Your runner interprets them. Here's what each command expects:

| Command   | Runner must                          | Runner must not                       |
| --------- | ------------------------------------ | ------------------------------------- |
| `invoke`  | Enqueue the target step              | Execute inline without queueing       |
| `fanout`  | Enqueue all items, track completion  | Assume ordering or atomicity          |
| `review`  | Block siblings, await human decision | Persist delta before approval         |
| `suspend` | Store checkpoint, stop execution     | Keep sibling commands (they're stale) |
| `emit`    | Dispatch to event bus or webhook     | Treat as synchronous call             |

::: warning What breaks if you ignore commands

- **Skipped `invoke`** – workflow stalls, dependent steps never run
- **Skipped `review`** – changes ship without human approval
- **Skipped `suspend`** – long-running workflows can't resume
- **Skipped `emit`** – external systems miss notifications
  :::

## When to skip workflows

If you just need one isolated step (e.g., a single summarizer), skip workflows and use the default identity. You can add a workflow later without rewriting your steps.
