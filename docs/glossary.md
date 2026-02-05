# Glossary

| Term                 | Definition                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Artifact**         | Captured input/output from a non-deterministic call (LLM, API, file read). Stored and hashed for replay.   |
| **Command**          | Declarative instruction returned by a step. Interpreted by your runner, not by the kernel.                 |
| **Computed**         | State derived from step outputs. Updated via shallow merge on each commit.                                 |
| **Diff**             | Comparison between original output and recomputed output.                                                  |
| **Effective**        | Read-only merge of computed + overlay: `{ ...computed, ...overlay }`. What the system acts on.             |
| **Event**            | Audit record emitted by a step. Append-only.                                                               |
| **Output**           | In-memory result of a step: `{ output, events, commands? }`. Exists during a run; artifacts persist after. |
| **Overlay**          | Human overrides applied on top of computed state. Overlay always wins.                                     |
| **Recompute**        | Re-run a step with new adapters and compare the diff.                                                      |
| **Recompute Status** | Classification of a recompute result: `clean`, `value_changed`, or `schema_violation`.                     |
| **Replay**           | Reproduce a past run exactly using stored artifacts.                                                       |
| **Schema Violation** | A schema mismatch detected during recompute output validation. Observational – does not gate the result.   |
| **Snapshot**         | Stored bundle of artifacts, metadata, and step output used for replay/recompute.                           |
| **Step**             | A deterministic function that returns `{ output, events, commands? }`.                                     |
| **Workflow**         | Named set of steps plus a version; provides stable identity and type-safe wiring.                          |

## Data flow

```text
run → output (memory) → artifacts (stored) → snapshot (bundle)
```
