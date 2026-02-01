---
"@verist/core": patch
"@verist/pipeline": patch
---

Fix null delta handling and add validation consistency

- Fix pipeline `??` operator treating `null` as missing delta
- Add name/version validation to `defineWorkflow`
- Add name validation to `definePipeline` and `runPipeline`
- Add `.min(1)` to command schema strings (step, reason, topic)
- Rename audit event `pipeline_stage_error` → `pipeline.stage_error`
