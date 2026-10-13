# Composition Module

## Purpose

The composition module owns browser-based reel composition and cover-intro rendering. It hides Playwright setup, composer URL handling, download/remux logic, background music lookup, FFmpeg settings, and cover image application behind workflow-level functions.

## Public Interface

- `composeFinalReel({ lipSyncedVideoPath, subtitlesPath, visualPrompt, composerUrl })`
- `applyCoverIntro({ videoPath, coverPath })`

`composeFinalReel` returns:

```js
{
  finalVideoPath,
  coveredVideoPath,
  rawRecordingPath,
  composerUrl
}
```

`applyCoverIntro` returns:

```js
{
  coveredVideoPath,
  finalVideoPath
}
```

## Files Changed

- `src/services/compositionService.js`
- `src/main_automation.js`
- `MODULE_COMPOSITION.md`

## Legacy Cleanup

- Moved browser automation, composer login, asset upload, recording/download handling, remuxing, background music lookup, and cover intro rendering out of `main_automation.js`.
- Added `REEL_COMPOSER_URL` support while preserving `http://localhost:3000` as the default.
- Kept output file naming compatible with existing root-level `FINAL_REEL_*.mp4` and `FINAL_REEL_COVERED_*.mp4` behavior.
- Main workflow now receives structured composition and cover results.

## Behavior Preserved

- Composer still defaults to `http://localhost:3000`.
- Playwright Chromium still launches with the same screen-capture arguments.
- The browser workflow still uses the same visible UI text and upload selectors.
- Final remuxing still applies the same audio delay, optional BGM mix, H.264 settings, AAC audio settings, and `+faststart`.
- Cover intro still uses `assets/cover.png` and `COVER_INTRO_DURATION_SEC`.

## Dependencies

- Local `reel-composer` dev server at `http://localhost:3000` unless `REEL_COMPOSER_URL` is set.
- Playwright Chromium.
- `assets/cover.png`.
- Optional background music: `assets/bgm.mp3`, `assets/Bgm.m4a`, `assets/BGM.wav`, and matching supported casing/extensions.
- `fluent-ffmpeg`.
- `ffmpeg-static`.
- Gemini API keys for composer login.

## Verification

Ran:

```bash
git diff --check
node --check src/services/compositionService.js
node --check src/main_automation.js
npm run typecheck
```

All passed.

## Risks

- Full browser composition was not run because it requires the local composer server, browser permissions, and valid provider keys.
- Browser automation remains brittle because it still depends on visible button text and local UI state.
- `rawRecordingPath` is currently returned as `null` because the raw browser recording is still deleted after remuxing to preserve existing cleanup behavior.

## Notes For Next Refactor

- Publishing can now consume the covered video path returned by `applyCoverIntro`.
- A later composition hardening pass should replace UI-text selectors with stable test IDs in `reel-composer`.
