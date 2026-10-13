# Script Module

## Purpose

The script module owns text generation for the workflow: spoken narration scripts and visual storyboard prompts. It hides Gemini key rotation, Groq fallback for narration scripts, prompt construction, and script cleanup behind task-focused functions.

## Public Interface

- `generateScriptForTask(task)`
- `generateVisualPromptForTask(task, script)`

Compatibility exports remain available for older callers:

- `generateScript(topic, description)`
- `generateVisualPrompt(topic, script)`

`generateScriptForTask` returns:

```js
{
  script,
  provider,
  model,
  wordCount
}
```

`generateVisualPromptForTask` returns:

```js
{
  visualPrompt,
  provider,
  model
}
```

## Files Changed

- `src/services/scriptService.js`
- `src/main_automation.js`
- `src/controllers/scriptController.js`
- `src/controllers/workflowController.js`
- `MODULE_SCRIPT.md`

## Legacy Cleanup

- Moved script cleanup into `scriptService` so callers no longer need `textCleaner` for generated scripts.
- Replaced plain string script results at direct workflow call sites with structured script results.
- Removed unused eager Gemini model initialization from `scriptService`.
- Split prompt building, Gemini key rotation, Groq fallback, output cleanup, and word counting into named functions inside the module.
- Preserved old `generateScript` and `generateVisualPrompt` exports so unrelated callers are not forced to change in this module pass.

## Behavior Preserved

- `src/main_automation.js` still generates a narration script from the task topic before audio generation.
- `src/main_automation.js` still generates the visual prompt from the same topic and generated script.
- Gemini key retry behavior is preserved for configured Gemini keys.
- Groq remains the fallback for narration script generation when Gemini fails.
- The `/script/generate` endpoint still returns `success`, `script`, and `rawScript`.
- Legacy workflow paths in `workflowController.js` still receive a plain script string for downstream audio and video steps.

## Dependencies

- `GEMINI_API_KEY`
- `GEMINI_API_KEY_FOR_VISUALS`
- `GEMINI_API_KEY_FOR_T2T`
- `GROQ_API_KEY`
- `@google/generative-ai`
- `groq-sdk`
- `src/config/logger.js`

## Verification

Ran:

```bash
node --check src/services/scriptService.js
node --check src/main_automation.js
node --check src/controllers/scriptController.js
node --check src/controllers/workflowController.js
```

All syntax checks passed.

## Risks

- Full script generation was not exercised in syntax checks because it requires valid AI provider credentials and network calls.
- Prompt wording was kept the same, but the service now centralizes cleanup before callers receive the script.
- `src/utils/textCleaner.js` remains in the repo for non-script callers or future cleanup; it is no longer used by direct script workflow call sites.

## Notes For Next Refactor

- The audio module can now depend on `scriptResult.script` from `generateScriptForTask`.
- Keep compatibility exports until later passes confirm no older scripts or tests call the string-returning functions directly.
- If a later workflow module introduces a shared `task` type, update `normalizeTask` in `scriptService` to consume that type directly.
