# Module Refactor Plan

This plan breaks the repo into modules that can be refactored one at a time without changing the current automation behavior. The current primary pipeline is `src/main_automation.js`. `src/controllers/workflowController.js` contains API-triggered and legacy manual workflow paths that should be preserved while module interfaces are introduced.

## Working Rules

- Work on feature branches only. Do not push directly to `main`.
- Refactor one module per branch and pull request.
- Keep behavior unchanged unless a bug is explicitly documented in that module's Markdown file.
- Clean legacy style only inside the active module and the direct callers needed to preserve compatibility.
- After each module refactor, create or update the root module note, for example `MODULE_AUDIO.md`.
- Prefer deep modules: small public interfaces with provider details, filesystem paths, env validation, and retry logic hidden inside the module.

## Current Workflow Stages

`src/main_automation.js` currently runs the GitHub Actions style pipeline:

1. Fetch next Google Sheets task with `getNextTask`.
2. Lock the row as `Processing` with `updateSheetStatus`.
3. Generate script with `generateScript`.
4. Generate cloned narration with `voiceboxService.generateClonedVoice`.
5. Slow audio with FFmpeg.
6. Lip-sync narration to `assets/Base-vedio.mp4` with `syncLip`.
7. Generate SRT subtitles with `createSubtitlesFromAudio`.
8. Generate visual prompt with `generateVisualPrompt`.
9. Record/render browser composition with inline `runCompositor`.
10. Add cover intro with inline `prependCoverIntro`.
11. Generate social caption with `generateUnifiedSocialMediaCaption`.
12. Upload to Supabase, YouTube, Instagram, and Facebook.
13. Update Google Sheets and send notifications.
14. Attempt staging cleanup and failure handling.

`src/controllers/workflowController.js` currently contains overlapping API and legacy paths:

1. `runAutomatedWorkflow` fetches a Sheets task and calls `runCompleteWorkflow`.
2. `runCompleteWorkflow` uses older Gemini TTS/SRT helpers, reel content generation, `composeReelVideo`, social uploads, Sheets updates, notifications, and cleanup.
3. `runWorkflow` is a legacy manual path using script generation, older audio/image/video assembly helpers, and inline FFmpeg composition.
4. Workflow status is stored in module-level `currentWorkflow`.

## Planned Module Order

1. Script
2. Audio
3. Lip-sync
4. Subtitles
5. Composition
6. Publishing
7. Sheets
8. Notifications
9. Cleanup

This order follows the runtime pipeline and reduces later refactors because each downstream module can consume stable structured results from the previous module.

## Cross-Cutting Verification

Use focused checks per module. For documentation-only changes, run:

```bash
git diff --check
```

For module changes, prefer the smallest relevant existing scripts first, then broader workflow checks:

```bash
node bin/test_api_keys_focused.js
node test/test_voicebox_check.js
node test/test_wav2lip_hq.js
node test/test_workflow_auto.js
node src/main_automation.js
```

Many checks require credentials, local assets, Python dependencies, model checkpoints, the reel composer dev server, or external APIs. If a verification command cannot run locally, record the exact blocker in the module Markdown file.

## Per-Module Documentation Template

After each module refactor, add or update the matching root Markdown file. Use this shape so the next module refactor can continue from a clear handoff:

```md
# [Module Name] Module

## Purpose

What this module owns.

## Public Interface

The functions or classes other code should call.

## Files Changed

- `src/...`

## Legacy Cleanup

What legacy style, duplication, mixed responsibility, or unclear logic was improved.

## Behavior Preserved

What should still work the same as before.

## Dependencies

Environment variables, services, assets, generated files, and external APIs.

## Verification

Commands run and results.

## Risks

Known weak spots or behavior that still needs testing.

## Notes For Next Refactor

What the next module refactor should know.
```

## Module 1: Script

### Current Files

- `src/services/scriptService.js`
- Script calls in `src/main_automation.js`
- Script calls and cleanup in `src/controllers/workflowController.js`
- `src/utils/textCleaner.js`

### Responsibilities

- Generate narration scripts from a task topic and optional description.
- Generate visual prompts from the topic and script.
- Retry Gemini keys.
- Fall back to Groq for script generation.
- Clean model output into spoken text.

### Desired Public Interface

```js
generateScriptForTask(task)
generateVisualPromptForTask(task, script)
```

Return structured results:

```js
{
  script,
  provider,
  model,
  wordCount
}
```

### Dependencies

- `GEMINI_API_KEY`
- `GEMINI_API_KEY_FOR_VISUALS`
- `GEMINI_API_KEY_FOR_T2T`
- `GROQ_API_KEY`
- `@google/generative-ai`
- `groq-sdk`
- `src/config/logger.js`

### Legacy Code To Clean Up

- Provider fallback logic is mixed directly with prompt assembly.
- Model IDs and comments are embedded in service scope.
- `workflowController.js` performs extra script cleanup through `textCleaner`.
- Result shape is plain text, so callers re-derive metadata or validation.

### Risks

- Prompt wording changes can affect generated output quality.
- Fallback ordering must remain compatible with current environment variable behavior.
- `workflowController.js` may still depend on legacy script formatting.

### Verification Commands

```bash
git diff --check
node bin/test_api_keys_focused.js
```

## Module 2: Audio

### Current Files

- `src/services/voiceboxService.js`
- `src/services/audioService.js`
- Voicebox and FFmpeg slowdown logic in `src/main_automation.js`
- Gemini TTS and audio-combine helpers in `src/controllers/workflowController.js`

### Responsibilities

- Generate narration audio from a script.
- Validate reference audio.
- Call the Voicebox Python backend.
- Apply speech-speed or slowdown processing.
- Preserve legacy audio paths where older workflows still need them.

### Desired Public Interface

```js
generateNarrationAudio({ script, voiceProfile })
prepareAudioForComposition(audioResult)
```

Return structured results:

```js
{
  audioPath,
  rawAudioPath,
  provider,
  referenceAudioPath,
  durationSec
}
```

### Dependencies

- `assets/Base-audio.mp3`
- `voicebox/main.py`
- Python runtime and Voicebox dependencies
- `fluent-ffmpeg`
- `ffmpeg-static`
- `src/config/logger.js`

### Legacy Code To Clean Up

- `src/services/audioService.js` currently exports an empty object.
- Audio reference path, output path, directory creation, and FFmpeg slowdown are inline in `main_automation.js`.
- `workflowController.js` contains legacy Gemini TTS helpers and audio combination logic.
- Voicebox service builds an unused shell command string even though it uses `spawn` args.

### Risks

- Voicebox and FFmpeg behavior are sensitive to local paths and generated filenames.
- Legacy manual workflow may expect `conversationFile` style results.
- Audio timing changes can affect subtitles and lip-sync.

### Verification Commands

```bash
git diff --check
node test/test_voicebox_check.js
node test/test_audio_quality.js
```

## Module 3: Lip-Sync

### Current Files

- `src/services/wav2lipService.js`
- Lip-sync orchestration in `src/main_automation.js`
- `wav2lip/`

### Responsibilities

- Validate the base face video.
- Run Wav2Lip inference.
- Support premium GFPGAN restoration when enabled.
- Return the initial merged talking-head video path.

### Desired Public Interface

```js
createLipSyncedVideo({ audioPath, baseVideoPath })
```

Return structured results:

```js
{
  videoPath,
  audioPath,
  baseVideoPath,
  premiumMode
}
```

### Dependencies

- `assets/Base-vedio.mp4`
- `wav2lip/inference.py`
- `wav2lip/checkpoints/wav2lip_gan.pth`
- Optional `wav2lip/checkpoints/GFPGANv1.4.pth`
- Optional `Base-vedio.npy`
- `USE_PREMIUM_WAV2LIP`
- Python runtime and Wav2Lip dependencies

### Legacy Code To Clean Up

- Base video path and output path are owned by `main_automation.js`.
- `syncLipHQ` is a pass-through wrapper.
- Command string logging duplicates the actual spawned args and can drift.
- Service naming exposes the provider instead of the workflow concept.

### Risks

- Checkpoints may be missing in local or CI environments.
- Base video can be a Git LFS pointer or corrupted stub.
- Long runtime makes full verification expensive.

### Verification Commands

```bash
git diff --check
node test/test_wav2lip_hq.js
node bin/test_reference_video_processing.js
```

## Module 4: Subtitles

### Current Files

- `src/utils/subtitles.js`
- `src/services/newFeaturesService.js`
- Subtitle calls and root `subtitles.srt` copy in `src/main_automation.js`
- Inline Gemini SRT helper in `src/controllers/workflowController.js`

### Responsibilities

- Generate timed subtitles from narration audio.
- Format SRT files.
- Preserve any root-level subtitle artifact required by downstream tools.

### Desired Public Interface

```js
createSubtitleTrack({ audioPath })
```

Return structured results:

```js
{
  subtitlesPath,
  rootCopyPath,
  transcript,
  provider
}
```

### Dependencies

- AssemblyAI API key if used by `createSubtitlesFromAudio`
- `GEMINI_API_KEY_FOR_AUDIO` for legacy Gemini SRT path
- `subtitles/` generated folder
- `src/config/logger.js`

### Legacy Code To Clean Up

- Subtitle generation is split between `utils/subtitles.js`, `newFeaturesService.js`, and inline controller helpers.
- Root `subtitles.srt` copy is performed by the workflow instead of the subtitle owner.
- SRT timestamp formatting exists inline in `workflowController.js`.

### Risks

- SRT timing changes affect visual composition.
- External transcription providers may be unavailable during tests.
- Downstream composer may rely on exact file locations.

### Verification Commands

```bash
git diff --check
node bin/test_subtitles_only.js
node bin/verify_subtitles.js
```

## Module 5: Composition

### Current Files

- Inline `runCompositor` in `src/main_automation.js`
- Inline `prependCoverIntro` in `src/main_automation.js`
- `src/services/videoProcessingService.js`
- `src/services/reactRenderService.js`
- `src/services/puppeteerRenderService.js`
- `reel-composer/`

### Responsibilities

- Pass lip-synced video, subtitles, and visual prompt into the composer.
- Drive browser rendering and recording.
- Remux recorded video with narration and optional background music.
- Apply cover intro.
- Return the final video path for publishing.

### Desired Public Interface

```js
composeFinalReel({ lipSyncedVideoPath, subtitlesPath, visualPrompt })
applyCoverIntro({ videoPath })
```

Return structured results:

```js
{
  finalVideoPath,
  coveredVideoPath,
  rawRecordingPath,
  composerUrl
}
```

### Dependencies

- Local `reel-composer` dev server at `http://localhost:3000`
- Playwright Chromium
- `assets/cover.png`
- Optional background music: `assets/bgm.mp3`, `assets/Bgm.m4a`, or similar
- `fluent-ffmpeg`
- `ffmpeg-static`
- Gemini API keys for composer login

### Legacy Code To Clean Up

- Browser automation, download handling, remuxing, BGM lookup, and cover intro are inline in `main_automation.js`.
- Hard-coded composer URL and button text are scattered through workflow logic.
- `workflowController.js` has older composition and image-overlay assembly logic.
- Output files are written to root with timestamp names.

### Risks

- Browser automation is brittle because it depends on UI text and local server state.
- Headless/headful behavior may differ between local and GitHub Actions.
- Audio/video sync can regress during remuxing.
- Full verification may take several minutes and require API keys.

### Verification Commands

```bash
git diff --check
node bin/test_video_composition.js
node bin/test_reel_generation.js
node bin/test_optimized_compression.js
```

## Module 6: Publishing

### Current Files

- `src/services/socialMediaService.js`
- `src/services/socialMediaPostingService.js`
- `src/services/instagramPostMaker.js`
- `src/services/facebookPostMaker.js`
- Upload and caption orchestration in `src/main_automation.js`
- Upload handling in `src/controllers/workflowController.js`

### Responsibilities

- Generate social caption content.
- Upload final video to YouTube.
- Stage video in Supabase for Meta uploads.
- Upload to Instagram and Facebook from a public URL.
- Return platform links and partial failure details.

### Desired Public Interface

```js
generatePublishingCaption({ topic })
publishReel({ videoPath, topic, caption })
cleanupPublishingStaging(publishResult)
```

Return structured results:

```js
{
  success,
  successCount,
  links: {
    youtube,
    instagram,
    facebook
  },
  staging,
  errors
}
```

### Dependencies

- YouTube OAuth env vars
- Instagram and Facebook env vars
- Supabase env vars
- Gemini/Groq keys for caption generation if used
- Network access to platform APIs

### Legacy Code To Clean Up

- Upload orchestration and success counting are inline in `main_automation.js`.
- Supabase cleanup calls are commented out in success and failure paths.
- `workflowController.js` formats upload results differently from `main_automation.js`.
- Platform-specific helpers and higher-level publishing behavior are mixed in `socialMediaService.js`.

### Risks

- External platform APIs have long-running, rate-limited, and credential-sensitive behavior.
- Partial success behavior must remain unchanged.
- Re-enabling staging cleanup without care can break Meta upload polling.

### Verification Commands

```bash
git diff --check
node bin/test_supabase_connection.js
node bin/test_youtube_upload_dummy.js
node bin/test_instagram_url.js
node bin/test_facebook_dummy.js
```

## Module 7: Sheets

### Current Files

- `src/services/sheetsService.js`
- Sheets calls in `src/main_automation.js`
- Sheets calls in `src/controllers/workflowController.js`

### Responsibilities

- Fetch the next task.
- Lock a task as processing.
- Mark task posted with links.
- Mark task failed with a useful error status.
- Hide Google Sheets client setup and row/column details.

### Desired Public Interface

```js
claimNextTask()
markTaskProcessing(task)
markTaskPosted(task, links)
markTaskFailed(task, error)
```

Return structured task data:

```js
{
  rowId,
  sno,
  idea,
  description,
  status
}
```

### Dependencies

- `GOOGLE_SHEET_ID`
- `GOOGLE_CREDENTIALS`
- `googleapis`
- Sheet column names described in `README.md`

### Legacy Code To Clean Up

- Callers know when and how to call `updateSheetStatus`.
- Failure status string slicing is performed in `main_automation.js`.
- Row locking is workflow-owned instead of Sheets-module-owned.
- Controller and automation paths duplicate task handling.

### Risks

- Sheet layouts may vary by user.
- Status strings are part of the external workflow contract.
- Incorrect row locking can cause duplicate processing.

### Verification Commands

```bash
git diff --check
node bin/test_posts_empty.js
node bin/test_resilient_workflow.js
```

Use a Sheets-specific smoke test if credentials are available.

## Module 8: Notifications

### Current Files

- `src/services/emailService.js`
- Notification calls in `src/main_automation.js`
- Notification calls in `src/controllers/workflowController.js`

### Responsibilities

- Send success, partial success, failure, and status emails.
- Format workflow context into useful messages.
- Hide mail transport setup and env validation.

### Desired Public Interface

```js
notifySuccess(result)
notifyFailure(errorContext)
notifyStatusUpdate(status)
```

Return structured delivery results:

```js
{
  sent,
  recipient,
  subject,
  error
}
```

### Dependencies

- `EMAIL_USER`
- `EMAIL_APP_PASSWORD`
- `NOTIFICATION_EMAIL`
- `nodemailer`
- `src/config/logger.js`

### Legacy Code To Clean Up

- Callers decide which email function maps to partial success.
- Error notification context is inconsistent between automation and controller paths.
- Email service likely owns too many message templates in one broad file.

### Risks

- Email failures currently should not hide the original workflow result.
- Users may rely on existing subject/body wording.
- Missing credentials should produce clear non-fatal behavior where appropriate.

### Verification Commands

```bash
git diff --check
node bin/test_api_security.js
```

Use a notification smoke test only when email credentials are configured.

## Module 9: Cleanup

### Current Files

- `src/services/cleanupService.js`
- Root artifact writes in `src/main_automation.js`
- Cleanup calls in `src/controllers/workflowController.js`
- Generated folders: `audio/`, `images/`, `subtitles/`, `temp/`, `final_video/`

### Responsibilities

- Prepare generated-output directories.
- Clean temporary files after success.
- Clean temporary files after failure.
- Own root artifact cleanup policy.
- Coordinate with Publishing cleanup for external staging files.

### Desired Public Interface

```js
prepareWorkflowWorkspace()
cleanupAfterSuccess(result)
cleanupAfterFailure(errorContext)
```

Return structured cleanup results:

```js
{
  removed,
  skipped,
  errors
}
```

### Dependencies

- Filesystem access to generated folders and root artifacts
- Publishing module staging results for Supabase cleanup
- `src/config/logger.js`

### Legacy Code To Clean Up

- Cleanup is spread across `cleanupService.js`, `main_automation.js`, and `workflowController.js`.
- Some cleanup calls are commented out.
- Root generated filenames are owned by workflow/composition instead of a shared artifact policy.
- Error cleanup behavior differs between controller paths.

### Risks

- Over-aggressive cleanup can delete user-provided assets or useful debug output.
- Under-aggressive cleanup can leave large media files in the repo root.
- External staging cleanup must not run before platform uploads finish.

### Verification Commands

```bash
git diff --check
node bin/mass_cleanup.js
```

Only run cleanup scripts after confirming they target generated files, not source assets.

## PR Message

### Title

Refactor plan for module-based architecture

### Description

```md
## Summary
- Adds a module-by-module refactor plan for the current automation pipeline.
- Documents the current workflow stages in `src/main_automation.js` and `src/controllers/workflowController.js`.
- Defines target module interfaces, dependencies, risks, legacy cleanup targets, and verification commands.

## Planned Module Order
- Script
- Audio
- Lip-sync
- Subtitles
- Composition
- Publishing
- Sheets
- Notifications
- Cleanup

## Legacy Cleanup Rules
- Clean legacy logic only inside the active module and direct compatibility callers.
- Preserve runtime behavior unless a bug is explicitly documented.
- Prefer small public interfaces that hide provider details, paths, env validation, and retry logic.
- Avoid unrelated rewrites and shallow pass-through modules.

## Verification
- Ran `git diff --check`.
- Documentation-only change; no runtime code was modified.

## Risks
- Some verification commands require credentials, media assets, local Python dependencies, model checkpoints, or the reel composer dev server.
- Later module refactors must stay tightly scoped to avoid breaking the end-to-end automation pipeline.
```
