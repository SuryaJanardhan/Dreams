# Audio Module

## Purpose

The audio module owns narration audio generation for the workflow. It hides Voicebox reference-audio paths, output paths, directory setup, FFmpeg slowdown, duration probing, and legacy audio result compatibility behind a small service interface.

## Public Interface

- `generateNarrationAudio({ script, voiceProfile })`
- `prepareAudioForComposition(audioResult)`

Compatibility export:

- `generateAudioWithBatchingStrategy(script)`

`generateNarrationAudio` returns:

```js
{
  (audioPath, rawAudioPath, provider, referenceAudioPath, durationSec);
}
```

`generateAudioWithBatchingStrategy` returns the legacy manual workflow shape:

```js
{
  (conversationFile,
    rawAudioPath,
    provider,
    referenceAudioPath,
    durationSec,
    segments);
}
```

## Files Changed

- `src/services/audioService.js`
- `src/services/voiceboxService.js`
- `src/main_automation.js`
- `MODULE_AUDIO.md`

## Legacy Cleanup

- Moved reference audio path selection, generated audio output naming, audio directory creation, Voicebox invocation, and FFmpeg `atempo=0.94` slowdown out of `src/main_automation.js`.
- Restored the missing `generateAudioWithBatchingStrategy` export so `workflowController`, `audioController`, and legacy scripts can import it again.
- Removed the unused shell command string from `voiceboxService`; it already executes Voicebox through safe `spawn` arguments.
- Kept provider-specific Voicebox and FFmpeg details behind `audioService`.

## Behavior Preserved

- The main automation pipeline still uses `assets/Base-audio.mp3` as the reference voice.
- Generated raw audio still uses `audio/cloned_voice_<timestamp>.wav`.
- Processed narration still applies `atempo=0.94` and writes `audio/slowed_<raw filename>`.
- The main workflow still passes the processed audio path into Wav2Lip and subtitle generation.
- Legacy callers still receive a `conversationFile` path.

## Dependencies

- `assets/Base-audio.mp3`
- `voicebox/main.py`
- Python runtime with Voicebox dependencies
- `fluent-ffmpeg`
- `ffmpeg-static`
- `src/config/logger.js`

## Verification

Ran:

```bash
git diff --check
node --check src/services/audioService.js
node --check src/services/voiceboxService.js
node --check src/main_automation.js
node --check src/controllers/audioController.js
node --check src/controllers/workflowController.js
npm run typecheck
```

All syntax checks and typecheck passed.

Also ran:

```bash
npm test
node --import tsx --test tests/rendering.test.ts
```

The full test suite passed 5 of 6 files and failed in `tests/rendering.test.ts`. The direct rerun also failed at the file level without an inner assertion message from Node's test output. This audio refactor did not touch the TypeScript rendering stack.

## Risks

- Full Voicebox synthesis was not exercised because it depends on local Python dependencies and model runtime availability.
- The restored legacy `generateAudioWithBatchingStrategy` now uses the Voicebox path rather than the older Gemini batching implementation, because that implementation was no longer present in `audioService`.
- FFmpeg duration probing is best-effort; audio generation still succeeds if duration metadata cannot be read.

## Notes For Next Refactor

- The lip-sync module can consume `audioResult.audioPath` directly from `generateNarrationAudio`.
- If legacy Gemini TTS should remain a supported path, move `generateGeminiTTS` out of `workflowController.js` in a later compatibility cleanup and make it an explicit provider inside the audio module.
- Keep the `generateAudioWithBatchingStrategy` compatibility export until all older controllers, scripts, and tests have been migrated.
