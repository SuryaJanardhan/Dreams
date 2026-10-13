# Subtitles Module

## Purpose

The subtitles module owns timed subtitle creation from narration audio and the root subtitle artifact expected by downstream tools.

## Public Interface

- `createSubtitleTrack({ audioPath, outputPath, rootCopyPath })`

Compatibility exports remain available:

- `createSubtitlesFromAudio(audioFilePath, outputPath)`
- `generateSubtitlesFromAudio(audioFilePath)`
- `saveSubtitlesToFile(subtitlesContent, outputPath)`
- `getAudioDuration(audioPath)`
- `validateSRTFormat(srtContent)`

`createSubtitleTrack` returns:

```js
{
  subtitlesPath,
  rootCopyPath,
  transcript,
  provider
}
```

## Files Changed

- `src/utils/subtitles.js`
- `src/main_automation.js`
- `MODULE_SUBTITLES.md`

## Legacy Cleanup

- Moved the root `subtitles.srt` copy out of `main_automation.js` and into the subtitle owner.
- Added a structured workflow-level subtitle API while preserving existing lower-level helpers.
- Removed an unused `generateSRT` import from `main_automation.js`.

## Behavior Preserved

- Main automation still generates subtitles with the existing AssemblyAI helper.
- Generated subtitle files still default to `subtitles/<audio filename>.srt`.
- A root-level `subtitles.srt` copy is still written for downstream compatibility.
- Existing callers can still use `createSubtitlesFromAudio` directly.

## Dependencies

- `ASSEMBLYAI_API_KEY`
- `subtitles/` generated folder
- `axios`
- `fluent-ffmpeg`
- `ffmpeg-static`

## Verification

Ran:

```bash
git diff --check
node --check src/utils/subtitles.js
node --check src/main_automation.js
npm run typecheck
```

All passed.

## Risks

- Full subtitle generation was not run because it requires a valid AssemblyAI key and network access.
- `workflowController.js` still has a legacy inline Gemini SRT path; that was left in place to keep this module pass narrow.
- `src/services/newFeaturesService.js` still contains a separate Gemini SRT helper used by older experimental code.

## Notes For Next Refactor

- Composition can now consume `subtitleTrack.subtitlesPath`.
- A later compatibility cleanup can move the inline Gemini SRT helper out of `workflowController.js` if that path still needs support.
