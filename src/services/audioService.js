const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const logger = require("../config/logger");
const voiceboxService = require("./voiceboxService");

ffmpeg.setFfmpegPath(ffmpegPath);

const AUDIO_DIR = path.resolve(__dirname, "../../audio");
const DEFAULT_REFERENCE_AUDIO = path.resolve(
  __dirname,
  "../../assets/Base-audio.mp3",
);
const DEFAULT_SLOWDOWN_RATE = 0.94;
const DEFAULT_VOICE_INSTRUCTION =
  "Steady, authoritative technical educational delivery. Professional and clear. Speak naturally with brief pauses at punctuation.";

function ensureAudioDirectory() {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
}

function assertReadableFile(filePath, message) {
  if (!fs.existsSync(filePath)) {
    throw new Error(message);
  }
}

function createGeneratedAudioPath(prefix = "cloned_voice", extension = "wav") {
  ensureAudioDirectory();
  return path.join(AUDIO_DIR, `${prefix}_${Date.now()}.${extension}`);
}

function slowAudio(
  inputPath,
  outputPath,
  slowdownRate = DEFAULT_SLOWDOWN_RATE,
) {
  logger.info(`⏳ Applying ${slowdownRate}x slowdown to audio...`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters(`atempo=${slowdownRate}`)
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .save(outputPath);
  });
}

function getAudioDurationSec(audioPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(audioPath, (error, metadata) => {
      if (error) {
        logger.warn(`Could not read audio duration: ${error.message}`);
        resolve(null);
        return;
      }

      resolve(metadata.format?.duration || null);
    });
  });
}

async function generateNarrationAudio({ script, voiceProfile = {} }) {
  if (!script || typeof script !== "string") {
    throw new Error("A non-empty script is required for audio generation");
  }

  ensureAudioDirectory();

  const referenceAudioPath = path.resolve(
    voiceProfile.referenceAudioPath || DEFAULT_REFERENCE_AUDIO,
  );
  assertReadableFile(
    referenceAudioPath,
    `CRITICAL: Base-audio.mp3 not found in assets. Voicebox requires this reference file.`,
  );

  const rawAudioPath =
    voiceProfile.outputPath || createGeneratedAudioPath("cloned_voice", "wav");
  const slowedAudioPath =
    voiceProfile.processedOutputPath ||
    path.join(
      path.dirname(rawAudioPath),
      `slowed_${path.basename(rawAudioPath)}`,
    );

  const instruction = voiceProfile.instruction || DEFAULT_VOICE_INSTRUCTION;
  const speed = voiceProfile.speed || 1.0;
  const slowdownRate = voiceProfile.slowdownRate || DEFAULT_SLOWDOWN_RATE;

  const generatedRawAudioPath = await voiceboxService.generateClonedVoice(
    script,
    referenceAudioPath,
    rawAudioPath,
    voiceProfile.referenceText || null,
    instruction,
    speed,
  );
  const audioPath = await slowAudio(
    generatedRawAudioPath,
    slowedAudioPath,
    slowdownRate,
  );
  const durationSec = await getAudioDurationSec(audioPath);

  return {
    audioPath,
    rawAudioPath: generatedRawAudioPath,
    provider: "voicebox",
    referenceAudioPath,
    durationSec,
  };
}

function prepareAudioForComposition(audioResult) {
  if (!audioResult?.audioPath) {
    throw new Error("Audio result is missing audioPath");
  }

  assertReadableFile(
    audioResult.audioPath,
    `Audio file not found: ${audioResult.audioPath}`,
  );
  return audioResult.audioPath;
}

async function generateAudioWithBatchingStrategy(script) {
  const audioResult = await generateNarrationAudio({ script });

  return {
    conversationFile: audioResult.audioPath,
    rawAudioPath: audioResult.rawAudioPath,
    provider: audioResult.provider,
    referenceAudioPath: audioResult.referenceAudioPath,
    durationSec: audioResult.durationSec,
    segments: [
      {
        text: script,
        file: audioResult.audioPath,
        duration: audioResult.durationSec || 0,
      },
    ],
  };
}

module.exports = {
  generateAudioWithBatchingStrategy,
  generateNarrationAudio,
  prepareAudioForComposition,
};
