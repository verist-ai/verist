# Suspend and Resume

Suspension is for when a step needs to pause and wait for external data.

Examples:

- Waiting for a webhook callback
- Waiting for a human-provided document
- Waiting for a long-running external job

## How it works

1. A step returns a `suspend` command with a checkpoint
2. The runner stores that checkpoint and stops execution
3. When external data arrives, you resume the workflow

## Suspend vs review

| Command     | Waits for      | Sibling commands                       |
| ----------- | -------------- | -------------------------------------- |
| **Review**  | Human decision | Deferred                               |
| **Suspend** | External data  | Discarded (resume with fresh commands) |

## Checkpoint contents

Keep it small and serializable:

- IDs you need to resume
- Parameters required to continue
- Nothing private you can't store

## Resume flow

A resume handler (often a dedicated step) receives:

- The original checkpoint
- The resume data (webhook payload, uploaded file, etc.)

It runs like any other step and emits new commands.

## Design tips

- Use a **dedicated resume step** for clarity
- Store **resume reasons** for audit
- Don't keep mutable state in memory while suspended
