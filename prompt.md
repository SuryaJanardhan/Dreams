# Module Refactor Prompt Pack

Use these prompts to refactor this repo module by module. Each module refactor must happen on a feature branch, preserve current behavior, clean legacy code only inside the active module, and leave a root-level Markdown note for the next refactor.

## Branch Rules

All refactor work must happen on a feature branch only.

Branch format:

```txt
refactor/module-architecture
refactor/module-script
refactor/module-audio
refactor/module-lipsync
refactor/module-subtitles
refactor/module-composition
refactor/module-publishing
refactor/module-sheets
refactor/module-notifications
refactor/module-cleanup
```

Recommended branch flow:

```bash
git checkout main
git pull
git checkout -b refactor/module-architecture
```

Never push directly to `main`.

Push only the feature branch:

```bash
git push -u origin refactor/module-architecture
```

## Refactor Plan

Create this root file first:

```txt
MODULE_REFACTOR_PLAN.md
```

Then create one Markdown file per module after each refactor:

```txt
MODULE_SCRIPT.md
MODULE_AUDIO.md
MODULE_LIPSYNC.md
MODULE_SUBTITLES.md
MODULE_COMPOSITION.md
MODULE_PUBLISHING.md
MODULE_SHEETS.md
MODULE_NOTIFICATIONS.md
MODULE_CLEANUP.md
```

Recommended module order:

1. `script`
2. `audio`
3. `lip-sync`
4. `subtitles`
5. `composition`
6. `publishing`
7. `sheets`
8. `notifications`
9. `cleanup`

For every module:

- Create or use a feature branch.
- Refactor only that module.
- Replace legacy style where it is inside that module.
- Keep behavior unchanged unless a bug is clearly documented.
- Commit with a proper message.
- Push the feature branch.
- Write a PR title and PR description.
- Create or update the module `.md` file in the repo root.

## Legacy Refactor Rules

When refactoring a module, also clean up legacy code inside that module:

- Replace large inline workflow logic with named functions.
- Remove duplicated logic if it has one clear owner.
- Avoid pass-through wrapper functions.
- Avoid mixed responsibilities in one file.
- Replace unclear names with domain names.
- Centralize path and env validation inside the owning module.
- Prefer returning structured results over writing hidden globals.
- Keep provider-specific logic behind a small interface.
- Do not rewrite unrelated modules just because they look messy.

## Prompt 1: Create Full Refactor Plan

```txt
Create a feature branch for the module refactor plan.

Branch name:
refactor/module-architecture

Then analyze this repo and create MODULE_REFACTOR_PLAN.md in the root.

Goal:
Refactor the repo module by module without breaking the current automation pipeline.

Requirements:
- Do not push to main.
- Work only on the feature branch.
- Identify workflow stages from src/main_automation.js and src/controllers/workflowController.js.
- Propose target modules.
- For each module, list:
  - current files
  - responsibilities
  - desired public interface
  - dependencies
  - legacy code to clean up
  - risks
  - verification commands
- Do not refactor implementation code yet.
- Commit with a clear message.
- Push the feature branch.
- Prepare a PR title and PR description.

Commit message:
docs: add module refactor plan

PR title:
Refactor plan for module-based architecture

PR description must include:
- Summary
- Planned module order
- Legacy cleanup rules
- Verification
- Risks
```

## Prompt 2: Refactor One Module

```txt
Refactor only the [MODULE_NAME] module.

Create a feature branch first.

Branch name:
refactor/module-[module-name]

Use these files as context:
- MODULE_REFACTOR_PLAN.md
- all existing MODULE_*.md files

Rules:
- Do not push to main.
- Work only on the feature branch.
- Keep behavior the same unless a bug is explicitly documented.
- Refactor only this module and direct imports/callers needed for compatibility.
- Replace legacy style and legacy logic inside this module where practical.
- Do not perform unrelated cleanup.
- Prefer a small public interface.
- Hide provider-specific logic, file paths, env validation, and implementation details inside the module.
- Avoid shallow wrapper modules.
- Add or update focused tests if practical.
- Run relevant verification commands.

After refactoring:
- Create or update MODULE_[NAME].md in the repo root.
- Commit with a proper message.
- Push the feature branch.
- Write a PR title and PR description.

MODULE_[NAME].md must include:
1. Purpose
2. Public interface
3. Files changed
4. Legacy code removed or improved
5. Behavior preserved
6. Dependencies
7. Verification performed
8. Known risks
9. Notes for the next module refactor

Commit message format:
refactor([module-name]): isolate [module-name] module

Example:
refactor(audio): isolate narration audio generation

PR title format:
Refactor [Module Name] module

PR description must include:
- Summary
- Files changed
- Public interface introduced
- Legacy logic cleaned up
- Behavior preserved
- Verification
- Risks / follow-ups
```

## Prompt 3: Continue Next Module

```txt
Continue the module-based refactor.

First:
- Check current git branch.
- If not already on a module refactor branch, create the next branch using:
  refactor/module-[module-name]
- Read MODULE_REFACTOR_PLAN.md.
- Read all existing MODULE_*.md files.
- Identify the next unfinished module.
- Confirm which files belong to that module.

Then:
- Refactor only that module.
- Keep behavior unchanged unless a bug is documented.
- Clean legacy style and legacy logic only inside that module.
- Avoid unrelated changes.
- Update imports/callers only as needed.
- Add or update focused tests if practical.
- Run relevant verification.

After:
- Create or update MODULE_[NAME].md.
- Commit with a proper conventional commit message.
- Push only the feature branch.
- Draft a PR title and PR description.
```

## Prompt 4: Review A Module Refactor

```txt
Review the latest module refactor.

Use code-review style.

Check:
- Is the work on a feature branch, not main?
- Does the commit message clearly describe the module refactor?
- Does the branch contain only relevant changes?
- Does the module have a small public interface?
- Are callers simpler than before?
- Is provider-specific logic hidden inside the module?
- Was legacy style or duplicated logic cleaned up inside the module?
- Was behavior preserved?
- Are tests or verification enough?
- Is MODULE_[NAME].md useful for the next module?
- Is the PR title and PR description clear?

Report:
1. Bugs or regressions
2. Architecture risks
3. Missing tests
4. Documentation gaps
5. PR message improvements
```

## Prompt 5: Generate Commit And PR Message

```txt
Generate a commit message and PR description for the current module refactor.

Read:
- git diff
- MODULE_[NAME].md
- MODULE_REFACTOR_PLAN.md

Output:
1. Conventional commit message
2. PR title
3. PR description

Commit message format:
refactor([module-name]): [short description]

PR description format:

## Summary
- ...

## Module Interface
- ...

## Legacy Cleanup
- ...

## Behavior Preserved
- ...

## Verification
- ...

## Risks
- ...
```

## Root Markdown Template

```md
# [Module Name] Module

## Purpose

What this module owns.

## Public Interface

The functions/classes other code should call.

## Files Changed

- src/...

## Legacy Cleanup

What legacy style, duplication, mixed responsibility, or unclear logic was improved.

## Behavior Preserved

What still works the same as before.

## Dependencies

Environment variables, services, assets, generated files, external APIs.

## Verification

Commands run and results.

## Risks

Known weak spots or behavior that still needs testing.

## Notes For Next Refactor

What the next module refactor should know.
```

## Suggested First Commit And PR

First branch:

```bash
git checkout -b refactor/module-architecture
```

First commit:

```txt
docs: add module refactor plan
```

First PR title:

```txt
Refactor plan for module-based architecture
```

First PR description:

```md
## Summary
- Adds a module-by-module refactor plan.
- Defines refactor order, target interfaces, and documentation rules.
- Establishes branch, commit, and PR expectations.

## Module Order
- Script
- Audio
- Lip-sync
- Subtitles
- Composition
- Publishing
- Sheets
- Notifications
- Cleanup

## Legacy Cleanup
- Clean legacy logic only inside the module currently being refactored.
- Avoid unrelated rewrites.
- Preserve behavior unless a bug is explicitly documented.

## Verification
- Documentation-only change.
- No runtime behavior changed.

## Risks
- Later module refactors must keep scope small to avoid breaking the automation pipeline.
```

## Module-Wise Copy Prompts

Copy one of these prompts when you are ready to refactor that specific module.

### Script Module Prompt

```txt
Refactor only the script module.

Create a feature branch first.

Branch name:
refactor/module-script

Use these files as context:
- MODULE_REFACTOR_PLAN.md
- all existing MODULE_*.md files

Likely files involved:
- src/services/scriptService.js
- script-related logic in src/main_automation.js
- script-related logic in src/controllers/workflowController.js
- any direct route/controller imports needed for compatibility

Rules:
- Do not push to main.
- Work only on the feature branch.
- Keep behavior the same unless a bug is explicitly documented.
- Refactor only the script module and direct imports/callers needed for compatibility.
- Replace legacy style and legacy logic inside the script module where practical.
- Do not perform unrelated cleanup.
- Prefer a small public interface.
- Hide provider-specific prompt/model/fallback details inside the module.
- Avoid shallow wrapper modules.
- Add or update focused tests if practical.
- Run relevant verification commands.

Target interface idea:
- generateScriptForTask(task)
- generateVisualPromptForTask(task, script)

After refactoring:
- Create or update MODULE_SCRIPT.md in the repo root.
- Commit with: refactor(script): isolate script generation module
- Push only the feature branch.
- Draft a PR title and PR description.

PR title:
Refactor Script module

PR description must include:
- Summary
- Files changed
- Public interface introduced
- Legacy logic cleaned up
- Behavior preserved
- Verification
- Risks / follow-ups
```

### Audio Module Prompt

```txt
Refactor only the audio module.

Create a feature branch first.

Branch name:
refactor/module-audio

Use these files as context:
- MODULE_REFACTOR_PLAN.md
- MODULE_SCRIPT.md if it exists
- all existing MODULE_*.md files

Likely files involved:
- src/services/audioService.js
- src/services/voiceboxService.js
- audio-generation and slowdown logic in src/main_automation.js
- audio-related logic in src/controllers/workflowController.js

Rules:
- Do not push to main.
- Work only on the feature branch.
- Keep behavior the same unless a bug is explicitly documented.
- Refactor only the audio module and direct imports/callers needed for compatibility.
- Replace legacy style and legacy logic inside the audio module where practical.
- Do not perform unrelated cleanup.
- Hide Voicebox, reference-audio path checks, output paths, and FFmpeg slowdown details inside the module.
- Prefer returning structured audio results instead of raw scattered paths.
- Avoid shallow wrapper modules.
- Add or update focused tests if practical.
- Run relevant verification commands.

Target interface idea:
- generateNarrationAudio({ script, voiceProfile })

After refactoring:
- Create or update MODULE_AUDIO.md in the repo root.
- Commit with: refactor(audio): isolate narration audio generation
- Push only the feature branch.
- Draft a PR title and PR description.

PR title:
Refactor Audio module

PR description must include:
- Summary
- Files changed
- Public interface introduced
- Legacy logic cleaned up
- Behavior preserved
- Verification
- Risks / follow-ups
```

### Lip-Sync Module Prompt

```txt
Refactor only the lip-sync module.

Create a feature branch first.

Branch name:
refactor/module-lipsync

Use these files as context:
- MODULE_REFACTOR_PLAN.md
- MODULE_SCRIPT.md if it exists
- MODULE_AUDIO.md if it exists
- all existing MODULE_*.md files

Likely files involved:
- src/services/wav2lipService.js
- lip-sync logic in src/main_automation.js
- wav2lip/ only if direct integration code requires small compatibility changes

Rules:
- Do not push to main.
- Work only on the feature branch.
- Keep behavior the same unless a bug is explicitly documented.
- Refactor only the lip-sync module and direct imports/callers needed for compatibility.
- Replace legacy style and legacy logic inside the lip-sync module where practical.
- Do not perform unrelated cleanup.
- Hide base-video path validation, Wav2Lip command details, and output path creation inside the module.
- Prefer returning a structured result with the generated video path.
- Avoid shallow wrapper modules.
- Add or update focused tests if practical.
- Run relevant verification commands.

Target interface idea:
- createLipSyncedVideo({ audioPath, baseVideoPath })

After refactoring:
- Create or update MODULE_LIPSYNC.md in the repo root.
- Commit with: refactor(lipsync): isolate lip-sync video generation
- Push only the feature branch.
- Draft a PR title and PR description.

PR title:
Refactor Lip-sync module

PR description must include:
- Summary
- Files changed
- Public interface introduced
- Legacy logic cleaned up
- Behavior preserved
- Verification
- Risks / follow-ups
```

### Subtitles Module Prompt

```txt
Refactor only the subtitles module.

Create a feature branch first.

Branch name:
refactor/module-subtitles

Use these files as context:
- MODULE_REFACTOR_PLAN.md
- all existing MODULE_*.md files

Likely files involved:
- src/utils/subtitles.js
- src/services/newFeaturesService.js if subtitle generation lives there
- subtitle-copy/write logic in src/main_automation.js
- subtitle-related logic in src/controllers/workflowController.js

Rules:
- Do not push to main.
- Work only on the feature branch.
- Keep behavior the same unless a bug is explicitly documented.
- Refactor only the subtitles module and direct imports/callers needed for compatibility.
- Replace legacy style and legacy logic inside the subtitles module where practical.
- Do not perform unrelated cleanup.
- Hide AssemblyAI/provider details, SRT formatting, output paths, and root subtitle copy behavior inside the module.
- Prefer returning structured subtitle results.
- Avoid shallow wrapper modules.
- Add or update focused tests if practical.
- Run relevant verification commands.

Target interface idea:
- createSubtitleTrack({ audioPath })

After refactoring:
- Create or update MODULE_SUBTITLES.md in the repo root.
- Commit with: refactor(subtitles): isolate subtitle generation
- Push only the feature branch.
- Draft a PR title and PR description.

PR title:
Refactor Subtitles module

PR description must include:
- Summary
- Files changed
- Public interface introduced
- Legacy logic cleaned up
- Behavior preserved
- Verification
- Risks / follow-ups
```

### Composition Module Prompt

```txt
Refactor only the composition module.

Create a feature branch first.

Branch name:
refactor/module-composition

Use these files as context:
- MODULE_REFACTOR_PLAN.md
- all existing MODULE_*.md files

Likely files involved:
- src/services/videoProcessingService.js
- src/services/reactRenderService.js
- src/services/puppeteerRenderService.js
- composition and Playwright logic in src/main_automation.js
- reel-composer/ only if direct interface compatibility requires it

Rules:
- Do not push to main.
- Work only on the feature branch.
- Keep behavior the same unless a bug is explicitly documented.
- Refactor only the composition module and direct imports/callers needed for compatibility.
- Replace legacy style and legacy logic inside the composition module where practical.
- Do not perform unrelated cleanup.
- Hide Playwright/browser recording details, cover-intro handling, render paths, and composer integration details inside the module.
- Prefer returning structured composition results.
- Avoid shallow wrapper modules.
- Add or update focused tests if practical.
- Run relevant verification commands.

Target interface idea:
- composeFinalReel({ lipSyncedVideoPath, subtitlesPath, visualPrompt })
- applyCoverIntro({ videoPath })

After refactoring:
- Create or update MODULE_COMPOSITION.md in the repo root.
- Commit with: refactor(composition): isolate reel composition
- Push only the feature branch.
- Draft a PR title and PR description.

PR title:
Refactor Composition module

PR description must include:
- Summary
- Files changed
- Public interface introduced
- Legacy logic cleaned up
- Behavior preserved
- Verification
- Risks / follow-ups
```

### Publishing Module Prompt

```txt
Refactor only the publishing module.

Create a feature branch first.

Branch name:
refactor/module-publishing

Use these files as context:
- MODULE_REFACTOR_PLAN.md
- all existing MODULE_*.md files

Likely files involved:
- src/services/socialMediaService.js
- src/services/socialMediaPostingService.js
- src/services/instagramPostMaker.js
- src/services/facebookPostMaker.js
- upload and caption logic in src/main_automation.js
- publishing-related logic in src/controllers/workflowController.js

Rules:
- Do not push to main.
- Work only on the feature branch.
- Keep behavior the same unless a bug is explicitly documented.
- Refactor only the publishing module and direct imports/callers needed for compatibility.
- Replace legacy style and legacy logic inside the publishing module where practical.
- Do not perform unrelated cleanup.
- Hide Supabase staging, YouTube, Instagram, Facebook, caption generation, cleanup of staged files, and platform-specific error handling inside the module.
- Prefer returning structured publish results with platform links.
- Avoid shallow wrapper modules.
- Add or update focused tests if practical.
- Run relevant verification commands.

Target interface idea:
- publishReel({ videoPath, topic, caption })
- generatePublishingCaption({ topic })

After refactoring:
- Create or update MODULE_PUBLISHING.md in the repo root.
- Commit with: refactor(publishing): isolate social publishing
- Push only the feature branch.
- Draft a PR title and PR description.

PR title:
Refactor Publishing module

PR description must include:
- Summary
- Files changed
- Public interface introduced
- Legacy logic cleaned up
- Behavior preserved
- Verification
- Risks / follow-ups
```

### Sheets Module Prompt

```txt
Refactor only the sheets module.

Create a feature branch first.

Branch name:
refactor/module-sheets

Use these files as context:
- MODULE_REFACTOR_PLAN.md
- all existing MODULE_*.md files

Likely files involved:
- src/services/sheetsService.js
- sheet task/status logic in src/main_automation.js
- sheet-related logic in src/controllers/workflowController.js

Rules:
- Do not push to main.
- Work only on the feature branch.
- Keep behavior the same unless a bug is explicitly documented.
- Refactor only the sheets module and direct imports/callers needed for compatibility.
- Replace legacy style and legacy logic inside the sheets module where practical.
- Do not perform unrelated cleanup.
- Hide Google Sheets client setup, column mapping, row locking, status transitions, and update details inside the module.
- Prefer domain-specific task methods over raw sheet operations.
- Avoid shallow wrapper modules.
- Add or update focused tests if practical.
- Run relevant verification commands.

Target interface idea:
- claimNextTask()
- markTaskProcessing(task)
- markTaskPosted(task, links)
- markTaskFailed(task, error)

After refactoring:
- Create or update MODULE_SHEETS.md in the repo root.
- Commit with: refactor(sheets): isolate task sheet operations
- Push only the feature branch.
- Draft a PR title and PR description.

PR title:
Refactor Sheets module

PR description must include:
- Summary
- Files changed
- Public interface introduced
- Legacy logic cleaned up
- Behavior preserved
- Verification
- Risks / follow-ups
```

### Notifications Module Prompt

```txt
Refactor only the notifications module.

Create a feature branch first.

Branch name:
refactor/module-notifications

Use these files as context:
- MODULE_REFACTOR_PLAN.md
- all existing MODULE_*.md files

Likely files involved:
- src/services/emailService.js
- notification calls in src/main_automation.js
- notification-related logic in src/controllers/workflowController.js

Rules:
- Do not push to main.
- Work only on the feature branch.
- Keep behavior the same unless a bug is explicitly documented.
- Refactor only the notifications module and direct imports/callers needed for compatibility.
- Replace legacy style and legacy logic inside the notifications module where practical.
- Do not perform unrelated cleanup.
- Hide email provider setup, message templates, env validation, and success/error formatting inside the module.
- Prefer domain-specific notification methods.
- Avoid shallow wrapper modules.
- Add or update focused tests if practical.
- Run relevant verification commands.

Target interface idea:
- notifySuccess(result)
- notifyFailure(errorContext)
- notifyStatusUpdate(status)

After refactoring:
- Create or update MODULE_NOTIFICATIONS.md in the repo root.
- Commit with: refactor(notifications): isolate workflow notifications
- Push only the feature branch.
- Draft a PR title and PR description.

PR title:
Refactor Notifications module

PR description must include:
- Summary
- Files changed
- Public interface introduced
- Legacy logic cleaned up
- Behavior preserved
- Verification
- Risks / follow-ups
```

### Cleanup Module Prompt

```txt
Refactor only the cleanup module.

Create a feature branch first.

Branch name:
refactor/module-cleanup

Use these files as context:
- MODULE_REFACTOR_PLAN.md
- all existing MODULE_*.md files

Likely files involved:
- src/services/cleanupService.js
- scattered temp/output path cleanup in src/main_automation.js
- cleanup-related logic in src/controllers/workflowController.js
- generated media folders only if path ownership needs documentation

Rules:
- Do not push to main.
- Work only on the feature branch.
- Keep behavior the same unless a bug is explicitly documented.
- Refactor only the cleanup module and direct imports/callers needed for compatibility.
- Replace legacy style and legacy logic inside the cleanup module where practical.
- Do not perform unrelated cleanup.
- Hide cleanup policy, generated folders, root artifact cleanup, and error cleanup behavior inside the module.
- Prefer explicit cleanup functions for workflow success and failure.
- Avoid shallow wrapper modules.
- Add or update focused tests if practical.
- Run relevant verification commands.

Target interface idea:
- prepareWorkflowWorkspace()
- cleanupAfterSuccess(result)
- cleanupAfterFailure(errorContext)

After refactoring:
- Create or update MODULE_CLEANUP.md in the repo root.
- Commit with: refactor(cleanup): isolate workflow cleanup
- Push only the feature branch.
- Draft a PR title and PR description.

PR title:
Refactor Cleanup module

PR description must include:
- Summary
- Files changed
- Public interface introduced
- Legacy logic cleaned up
- Behavior preserved
- Verification
- Risks / follow-ups
```
