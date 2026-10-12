const fs = require("fs");
require("dotenv").config();

const {
  claimNextTask,
  markTaskFailed,
  markTaskPosted,
  markTaskProcessing,
} = require("./services/sheetsService");
const {
  generateScriptForTask,
  generateVisualPromptForTask,
} = require("./services/scriptService");
const { createSubtitleTrack } = require("./utils/subtitles");
const {
  sendErrorNotification,
  sendSuccessNotification,
} = require("./services/emailService");
const Groq = require("groq-sdk");
const logger = require("./config/logger");
const { createLipSyncedVideo } = require("./services/wav2lipService");
const {
  generateNarrationAudio,
  prepareAudioForComposition,
} = require("./services/audioService");
const {
  applyCoverIntro,
  composeFinalReel,
} = require("./services/compositionService");
const {
  cleanupPublishingStaging,
  generatePublishingCaption,
  publishReel,
} = require("./services/publishingService");

async function main() {
  logger.info("🚀 STARTING REELS AUTOMATION PIPELINE");
  const sessionStart = Date.now();

  let task = null;
  let currentStep = "Initialization";
  var supabaseInfo = null;
  try {
    // Step 0: Fetch task
    currentStep = "Fetching Task from Sheets";
    logger.info("📊 Step 0: Fetching task from Google Sheets...");
    const step0Start = Date.now();
    task = await claimNextTask();
    logger.info(
      `✅ Step 0 Complete: Task fetched in ${((Date.now() - step0Start) / 1000).toFixed(2)}s`,
    );

    // IMMEDIATE LOCK: Set status to Processing to avoid double-runs
    await markTaskProcessing(task);

    const TOPIC = task.idea;
    logger.info(`📝 Target Topic: "${TOPIC}"`);

    // Step 1: Script
    currentStep = "Script Generation";
    logger.info("📝 Step 1: Generating AI Script...");
    const step1Start = Date.now();
    const scriptResult = await generateScriptForTask({ idea: TOPIC });
    const script = scriptResult.script;
    logger.info(
      `✅ Step 1 Complete: Script generated in ${((Date.now() - step1Start) / 1000).toFixed(2)}s`,
    );

    // Step 2: Audio (Cloned via Voicebox)
    currentStep = "Audio Generation (Voicebox)";
    logger.info("🎤 Step 2: Generating Cloned Audio via Voicebox...");
    const step2Start = Date.now();
    const audioResult = await generateNarrationAudio({ script });
    const audioPath = prepareAudioForComposition(audioResult);

    /* GEMINI TTS FALLBACK (Commented out)
        if (fs.existsSync(CACHE_AUDIO)) {
            logger.info("♻️ Using cached audio_cache.wav to save API quota.");
            audioPath = CACHE_AUDIO;
        } else {
            const audioResult = await generateAudioWithBatchingStrategy(script);
            audioPath = audioResult.conversationFile;
        }
        */
    logger.info(
      `✅ Step 2 Complete: Audio ready at ${audioPath} (${((Date.now() - step2Start) / 1000).toFixed(2)}s)`,
    );

    // Step 3: Wav2Lip Sync (Dynamic Talking Head)
    currentStep = "Wav2Lip Lip-Syncing";
    logger.info("👄 Step 3: Performing Wav2Lip Sync (Dynamic Talking Head)...");
    const step3Start = Date.now();

    const lipSyncResult = await createLipSyncedVideo({ audioPath });
    const INIT_MERGE = lipSyncResult.videoPath;
    logger.info(
      `✅ Step 3 Complete: Wav2Lip sync success in ${((Date.now() - step3Start) / 1000).toFixed(2)}s`,
    );

    // Step 4: SRT (using AssemblyAI)
    currentStep = "SRT Generation (AssemblyAI)";
    logger.info("📜 Step 4: Generating Subtitles (SRT) via AssemblyAI...");
    const step4Start = Date.now();
    const subtitleTrack = await createSubtitleTrack({ audioPath });
    const srtPath = subtitleTrack.subtitlesPath;
    logger.info(
      `✅ Step 4 Complete: SRT generated in ${((Date.now() - step4Start) / 1000).toFixed(2)}s`,
    );

    // Step 5: Visual Prompt (Migrated to Gemini)
    currentStep = "Visual Prompt Generation";
    logger.info("🎨 Step 5: Creating visual prompt via Gemini...");
    const step5Start = Date.now();

    const visualPromptResult = await generateVisualPromptForTask(
      { idea: TOPIC },
      script,
    );
    const visualPrompt = visualPromptResult.visualPrompt;

    // Final guard: stop workflow if prompt is essentially empty
    if (!visualPrompt || visualPrompt.length < 10) {
      throw new Error(
        "CRITICAL: Visual prompt generation returned no usable content. Aborting to avoid empty video.",
      );
    }

    fs.writeFileSync("visual_prompt.txt", visualPrompt);
    logger.info(
      `✅ Step 5 Complete: Visual prompt ready in ${((Date.now() - step5Start) / 1000).toFixed(2)}s`,
    );

    // Step 6: Playwright Logic
    currentStep = "Browser Recording & Composition";
    logger.info(
      "🌐 Step 6: Recording Unified Visuals via Browser Compositor...",
    );
    const step6Start = Date.now();
    const compositionResult = await composeFinalReel({
      lipSyncedVideoPath: INIT_MERGE,
      subtitlesPath: srtPath,
      visualPrompt,
    });
    const finalMasterPath = compositionResult.finalVideoPath;
    logger.info(
      `✅ Step 6 Complete: MASTER REEL created at ${finalMasterPath} (${((Date.now() - step6Start) / 1000).toFixed(2)}s)`,
    );

    // Step 6.5: Prepend static cover image for first 1 second (for Instagram cover consistency)
    currentStep = "Applying Cover Intro";
    logger.info(
      "🖼️ Step 6.5: Prepending cover intro frame (assets/cover.png)...",
    );
    const step65Start = Date.now();
    const coverResult = await applyCoverIntro({ videoPath: finalMasterPath });
    const videoForPosting = coverResult.coveredVideoPath;
    logger.info(
      `✅ Step 6.5 Complete: Cover intro applied in ${((Date.now() - step65Start) / 1000).toFixed(2)}s`,
    );

    // Step 7: Social Content
    currentStep = "Generating Captions";
    logger.info("✍️ Step 7: Creating social media captions...");
    const step7Start = Date.now();
    const social = await generatePublishingCaption({ topic: TOPIC });
    logger.info(
      `✅ Step 7 Complete: Captions ready in ${((Date.now() - step7Start) / 1000).toFixed(2)}s`,
    );

    // Step 8: Upload
    currentStep = "Uploading to Social Media";
    logger.info("📤 Step 8: Starting Social Media Uploads...");
    const step8Start = Date.now();
    const publishResult = await publishReel({
      videoPath: videoForPosting,
      topic: TOPIC,
      caption: social.caption,
    });
    const links = publishResult.links;
    const successCount = publishResult.successCount;
    supabaseInfo = publishResult.staging;

    logger.info(
      `✅ Step 8 Complete: ${successCount}/3 uploads finished in ${((Date.now() - step8Start) / 1000).toFixed(2)}s`,
    );

    // Step 9: Update Sheet & Notify
    currentStep = "Updating Sheets & Notifications";

    // Critical Logic: If at least one succeeded, we treat it as a success notification pass
    if (successCount > 0) {
      await markTaskPosted(task, links);

      // Final Success Email (will indicate partial if necessary)
      await sendSuccessNotification(task, links).catch((e) =>
        logger.error(`❌ Email failed: ${e.message}`),
      );
    } else {
      // If ALL 3 failed, we treat it as a total failure
      const error = new Error(
        "All social media uploads failed (YouTube, Instagram, and Facebook). Check logs for details.",
      );
      throw error;
    }

    // CRITICAL CLEANUP: Delete from Supabase staging
    await cleanupPublishingStaging(publishResult);

    const totalTime = ((Date.now() - sessionStart) / 1000).toFixed(2);
    logger.info(`✨ AUTOMATION SUCCESSFUL | Total Time: ${totalTime}s`);
  } catch (err) {
    logger.error(
      `❌ PIPELINE FAILED | Step: [${currentStep}] | Error: ${err.message}`,
    );

    // Cleanup on failure as well, if we managed to upload anything
    if (supabaseInfo && supabaseInfo.success && supabaseInfo.fileName) {
      await cleanupPublishingStaging({ staging: supabaseInfo });
    }

    await markTaskFailed(task, err);

    // Send Error Email - NOW ENABLED
    await sendErrorNotification(task, err, currentStep).catch((e) =>
      logger.error(`❌ Error email failed: ${e.message}`),
    );
  }
}

main();
