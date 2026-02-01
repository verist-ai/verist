# Glossary

| Term          | Definition                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| **Artifact**  | Captured input/output from a non-deterministic call (LLM, API, file read). Stored and hashed for replay.  |
| **Command**   | Declarative instruction returned by a step. Interpreted by your runner, not by the kernel.                |
| **Computed**  | State derived from step deltas.                                                                           |
| **Delta**     | Partial state update returned by a step.                                                                  |
| **Diff**      | Comparison between original output and recomputed output.                                                 |
| **Event**     | Audit record emitted by a step. Append-only.                                                              |
| **Output**    | In-memory result of a step: `{ delta, events, commands? }`. Exists during a run; artifacts persist after. |
| **Overlay**   | Human overrides applied on top of computed state. Overlay always wins.                                    |
| **Recompute** | Re-run a step with new adapters and compare the diff.                                                     |
| **Replay**    | Reproduce a past run exactly using stored artifacts.                                                      |
| **Snapshot**  | Stored bundle of artifacts, metadata, and step output used for replay/recompute.                          |
| **Step**      | A deterministic function that returns `{ delta, events, commands? }`.                                     |
| **Workflow**  | Named set of steps plus a version; provides stable identity and type-safe wiring.                         |

## Data flow

```text
run → output (memory) → artifacts (stored) → snapshot (bundle)
```
