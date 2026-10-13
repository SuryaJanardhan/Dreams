# Lip-Sync Module

## Purpose

The lip-sync module owns talking-head video generation. It hides the default base video path, output path, Wav2Lip runtime paths, face-cache handling, and optional GFPGAN restoration behind a workflow-level function.

## Public Interface

- `createLipSyncedVideo({ audioPath, baseVideoPath, outputPath, options })`

Compatibility exports:

- `syncLip(audioPath, facePath, outputPath, options)`
- `syncLipHQ(audioPath, facePath, outputPath)`

`createLipSyncedVideo` returns:

```js
{
  videoPath,
  audioPath,
  baseVideoPath,
  premiumMode
}
```

## Files Changed

- `src/services/wav2lipService.js`
- `src/main_automation.js`
- `MODULE_LIPSYNC.md`

## Legacy Cleanup

- Moved default `assets/Base-vedio.mp4` and `merged_output.mp4` ownership into `wav2lipService`.
- Introduced `createLipSyncedVideo` so callers use workflow language instead of provider-specific `syncLip`.
- Centralized base-video validation, Wav2Lip runtime path setup, face-cache path lookup, and premium-mode resolution.
- Removed duplicate command-string logging that could drift from the actual `spawn` arguments.
- Kept `syncLip` and `syncLipHQ` for existing tests and scripts.

## Behavior Preserved

- The main automation pipeline still uses `assets/Base-vedio.mp4` as the talking-head source.
- The initial merged talking-head output still writes to `merged_output.mp4`.
- Wav2Lip still runs through Python `spawn` with streamed logs.
- Existing direct callers can still call `syncLip`.
- GFPGAN restoration is still optional and enabled by `options.restorer === "gfpgan"` or `USE_PREMIUM_WAV2LIP=true` when the checkpoint is present.

## Dependencies

- `assets/Base-vedio.mp4`
- `wav2lip/inference.py`
- `wav2lip/checkpoints/wav2lip_gan.pth`
- Optional `wav2lip/checkpoints/GFPGANv1.4.pth`
- Optional `Base-vedio.npy`
- `USE_PREMIUM_WAV2LIP`
- Python runtime and Wav2Lip dependencies

## Verification

Ran:

```bash
git diff --check
node --check src/services/wav2lipService.js
node --check src/main_automation.js
npm run typecheck
```

All passed.

## Risks

- Full Wav2Lip execution was not run because the local `assets/Base-vedio.mp4` and `wav2lip/checkpoints/wav2lip_gan.pth` files appear to be tiny pointer/stub files, not usable media/model files.
- `syncLipHQ` remains a compatibility pass-through; deeper high-quality mode should be designed separately if it becomes a real product requirement.
- The service still exposes `syncLip` directly for older scripts, so provider naming is not fully removed yet.

## Notes For Next Refactor

- The subtitles module can consume `lipSyncResult.videoPath` when composition becomes structured end-to-end.
- If asset download or Git LFS recovery is required, keep that outside the lip-sync runtime path unless the product explicitly wants auto-repair.
