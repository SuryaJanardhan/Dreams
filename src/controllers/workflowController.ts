import { present } from "../compat/guards.js";
import { missingWorkflowImages as generateImages } from "../compat/historical.js";
import { historicalSubtitleWriter } from "../compat/historical.js";
import type { LegacyWorkflowState } from "../compat/contracts.js";
import type {
  LegacyTask,
  LegacyRequest,
  LegacyResponse,
  LegacyImage,
  LegacyAudioFiles,
} from "../compat/contracts.js";
import { failureInfo } from "../compat/errors.js";
import legacyModule0 = require("../services/scriptService.js");
const { generateScriptForTask } = legacyModule0;
import legacyModule1 = require("../services/audioService.js");
const { generateAudioWithBatchingStrategy } = legacyModule1;
import legacyModule2 = require("../services/imageService.js");
const { generateTitleImage } = legacyModule2;
import legacyModule3 = require("../services/videoProcessingService.js");
const {
  getBaseVideo,
  composeVideo,
  composeReelVideo,
  createPlatformOptimized,
} = legacyModule3;
import legacyModule4 = require("../utils/subtitles.js");
const createSubtitlesFile = historicalSubtitleWriter(legacyModule4);
const { createSubtitleTrack } = legacyModule4;
import legacyModule5 = require("../services/sheetsService.js");
const { getNextTask, markTaskFailed, markTaskPosted } = legacyModule5;
import legacyModule6 = require("../services/publishingService.js");
const { cleanupPublishingStaging, generatePublishingCaption, publishReel } =
  legacyModule6;
// const VideoPostingService = require("../services/videoPostingService");
import legacyModule7 = require("../services/emailService.js");
const { notifyFailure, notifyStatusUpdate, notifySuccess } = legacyModule7;
import legacyModule8 = require("../services/cleanupService.js");
const { cleanupAfterFailure, cleanupAfterSuccess, initializeDirectories } =
  legacyModule8;
import logger = require("../config/logger.js");
import fs = require("fs");
import path = require("path");
import ffmpeg = require("fluent-ffmpeg");
import { GoogleGenerativeAI } from "@google/generative-ai";

// Generate reel content using the new service
const generateReelContent = async (
  topic: string,
  srtContent: string,
  apiKey: string,
) => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `Create an educational video animation that complements a single-narrator explanation about: "${topic}"

SRT SUBTITLE TRANSCRIPT (from the narrator's speech):
${srtContent}

VIDEO ANIMATION REQUIREMENTS:
1. Single-narrator educational format - visuals should support and enhance the spoken explanation
2. Dynamic background: Use day-based color schemes (check current day for appropriate colors)
3. Text overlays: Display subtitle text in sync with speech timing
4. Visual elements: Add relevant icons, diagrams, or animations that illustrate key concepts
5. Typography: Use Montserrat Bold font for professional Instagram appearance
6. Layout: Clean, modern design optimized for mobile viewing
7. Animations: Smooth GSAP animations that highlight important concepts
8. Flow: Visual progression that matches the educational narrative structure

TECHNICAL SPECS:
- HTML5 with embedded CSS and JavaScript
- GSAP animations for smooth transitions
- Responsive design for various screen sizes
- Black background with colored accents
- Professional educational aesthetic

Return ONLY valid HTML with embedded CSS and JavaScript. The animation should educate visually while the narrator explains verbally.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
};

let currentWorkflow: LegacyWorkflowState = {
  taskId: null,
  status: "idle",
  currentStep: null,
  error: null,
  results: {},
  taskData: null,
};

/**
 * Run the complete workflow from start to finish
 */
const runCompleteWorkflow = async (taskData: LegacyTask) => {
  const taskId = Date.now().toString();
  currentWorkflow = {
    taskId,
    status: "running",
    currentStep: "script/generate",
    error: null,
    results: {},
    taskData: taskData,
  };

  try {
    logger.info(`🚀 Starting complete workflow for: ${taskData.idea}`);

    // Step 1: Generate script
    logger.info("📝 Step 1: Generating script");
    currentWorkflow.currentStep = "script/generate";
    const scriptResult = await generateScriptForTask(taskData);
    const script = scriptResult.script;
    currentWorkflow.results.script = script;

    // Save script to scripts folder
    const scriptFileName = `script_${taskId}.txt`;
    const scriptFilePath = path.join("scripts", scriptFileName);
    fs.writeFileSync(scriptFilePath, script);
    currentWorkflow.results.scriptFilePath = scriptFilePath;
    logger.info(`✓ Script generated and saved`);

    // Step 2: Generate narration audio
    logger.info("🎵 Step 2: Generating narration audio");
    currentWorkflow.currentStep = "audio/generate";
    const audioFiles = await generateAudioWithBatchingStrategy(script);
    const audioPath = audioFiles.conversationFile;
    currentWorkflow.results.audioPath = audioPath;
    if (!audioFiles) throw new Error("Audio generation returned no result");
    currentWorkflow.results.audioFiles = audioFiles;
    logger.info(`✓ Audio generated: ${audioPath}`);

    // Step 3: Generate SRT from audio
    logger.info("📝 Step 3: Generating SRT subtitles");
    currentWorkflow.currentStep = "subtitles/generate";
    const subtitleTrack = await createSubtitleTrack({ audioPath });
    currentWorkflow.results.subtitles = subtitleTrack.subtitlesPath;
    currentWorkflow.results.srtContent = subtitleTrack.transcript;
    logger.info(`✓ SRT generated: ${subtitleTrack.subtitlesPath}`);

    // Step 4: Get base video (without audio)
    logger.info("🎬 Step 4: Preparing base video");
    currentWorkflow.currentStep = "video/prepare";
    const baseVideoPath = path.join(__dirname, "../../assets/Base-vedio.mp4");
    if (!fs.existsSync(baseVideoPath)) {
      throw new Error("Base video not found: assets/Base-vedio.mp4");
    }
    currentWorkflow.results.baseVideoPath = baseVideoPath;
    logger.info(`✓ Base video ready: ${baseVideoPath}`);

    // Step 5: Generate reel content with visuals and animations
    logger.info("🎨 Step 5: Generating reel content with AI visuals");
    currentWorkflow.currentStep = "reel/generate";
    const visualsApiKey = process.env.GEMINI_API_KEY_FOR_VISUALS;
    if (!visualsApiKey) {
      throw new Error(
        "GEMINI_API_KEY_FOR_VISUALS not found in environment variables",
      );
    }

    const reelContent = await generateReelContent(
      present(taskData.idea, "taskData.idea"),
      subtitleTrack.transcript,
      visualsApiKey,
    );
    currentWorkflow.results.reelContent = reelContent;
    logger.info(`✓ Reel content generated with stunning animations`);

    // Step 6: Compose final video with reel content
    logger.info("🎬 Step 6: Composing final video with reel animations");
    currentWorkflow.currentStep = "video/compose";

    const outputPath = path.join("final_video", `reel_${taskId}.mp4`);
    await composeReelVideo({
      baseVideo: baseVideoPath,
      subtitles: subtitleTrack.subtitlesPath,
      backgroundMusic: null, // No background music for now
      outputPath,
      subtitleSettings: {
        fontSize: 32,
        fontFamily: "Inter",
        color: "#FFFFFF",
        bgColor: "rgba(0,0,0,0.8)",
        paddingX: 16,
        paddingY: 8,
      },
    });

    currentWorkflow.results.finalVideo = outputPath;
    logger.info(`✓ Final video composed: ${outputPath}`);

    // Step 7: Upload to platforms
    logger.info("📤 Step 7: Uploading to platforms");
    currentWorkflow.currentStep = "upload/platforms";

    const social = await generatePublishingCaption({
      topic: taskData.idea ?? "",
    });
    const publishResult = await publishReel({
      videoPath: outputPath,
      topic: taskData.idea ?? "",
      caption: social.caption,
    });

    currentWorkflow.results.uploadResult = publishResult;

    const successfulUploads = publishResult.successCount;
    const totalUploads = 3;

    logger.info(
      `📊 Upload Results: ${successfulUploads}/${totalUploads} platforms succeeded`,
    );

    publishResult.errors.forEach((error) =>
      logger.warn(`⚠️ ${error.platform} failed: ${error.message}`),
    );

    // Step 8: Mark as posted and update sheets
    logger.info("📊 Step 8: Updating status and sheets");
    currentWorkflow.currentStep = "sheets/update";

    await markTaskPosted(taskData, publishResult.links);
    logger.info(
      `✓ Marked as "Posted" in sheets with ${successfulUploads} successful links`,
    );

    // Handle different success scenarios
    if (publishResult.success) {
      currentWorkflow.status =
        successfulUploads === totalUploads ? "completed" : "partial_success";

      // Step 9: Cleanup
      logger.info("🧹 Step 9: Cleaning up temporary files");
      await cleanupAfterSuccess();
      await cleanupPublishingStaging(publishResult);
      logger.info("✓ Cleanup completed");

      // Step 10: Success notification
      logger.info("📧 Step 10: Sending success notification");
      await notifySuccess({ task: taskData, links: publishResult.links });
      logger.info("✅ Success notification email sent");

      // Step 11: Clean final video folder
      logger.info("🧹 Step 11: Cleaning final video folder");
      const { cleanupFinalVideoFolder } = require("../services/cleanupService");
      await cleanupFinalVideoFolder();
      logger.info("✓ Final video folder cleanup completed");
    } else {
      throw new Error(
        "All social media uploads failed (YouTube, Instagram, and Facebook). Check logs for details.",
      );
    }

    logger.info(`✅ Workflow completed successfully for: ${taskData.idea}`);
  } catch (error) {
    const caughtDetails9 = failureInfo(error);

    logger.error("❌ Workflow failed:", {
      error: caughtDetails9.message,
      stack: caughtDetails9.stack,
      currentStep: currentWorkflow.currentStep,
      taskId: currentWorkflow.taskId,
      taskIdea: taskMetadata(taskData).idea,
      taskDescription: taskMetadata(taskData).description,
      timestamp: new Date().toISOString(),
    });
    currentWorkflow.status = "failed";
    currentWorkflow.error = caughtDetails9.message;

    // Emergency cleanup on error
    await cleanupAfterFailure();
    await markTaskFailed(taskData, error);

    // Send error notification
    await notifyFailure({
      task: taskData,
      error,
      step: currentWorkflow.currentStep ?? "",
    });

    throw error;
  }
};

/**
 * Main automated workflow - pulls from Google Sheets and processes with checkpoints
 */
const runAutomatedWorkflow = async (
  req: LegacyRequest,
  res: LegacyResponse,
  next?: import("express").NextFunction,
) => {
  let taskData: LegacyTask | null = null;

  try {
    logger.info("🚀 Starting automated content creation workflow...");

    // Initialize directories
    initializeDirectories();

    // Get next task from Google Sheets
    logger.info("📋 Getting next task from Google Sheets");

    try {
      taskData = await getNextTask();
      logger.info(
        `📋 Task retrieved: ${taskData.idea} (Row ${taskData.rowId})`,
      );
    } catch (taskError) {
      const caughtDetails10 = failureInfo(taskError);

      if (caughtDetails10.message.includes("No 'Not Posted' tasks found")) {
        logger.info("📋 No tasks available for processing");

        // Send immediate response
        res.json({
          success: true as const,
          message: "No tasks available for processing",
          status: "completed",
          note: "All tasks have been processed. Add new tasks to continue.",
        });

        // Send helpful status update
        await notifyStatusUpdate({
          status: "No Tasks Available",
          details:
            "The automated workflow checked for tasks but found none marked as 'Not Posted'. All current tasks have been processed successfully.",
          aiSuggestions: {
            "Checked At": new Date().toLocaleString(),
            "Next Steps":
              "Add new content ideas to your Google Sheet with status 'Not Posted'",
          },
        });

        return; // Exit early
      } else {
        // Re-throw other errors
        throw taskError;
      }
    }

    // Send immediate response
    res.json({
      success: true as const,
      message: "Automated workflow started successfully",
      taskId: Date.now().toString(),
      status: "running",
      note: "Check workflow status at /workflow/status or wait for email notification",
    });

    // Run the complete workflow
    await runCompleteWorkflow(taskData);
  } catch (error) {
    const caughtDetails11 = failureInfo(error);

    logger.error("❌ Automated workflow failed:", {
      error: caughtDetails11.message,
      stack: caughtDetails11.stack,
      taskId: taskMetadata(taskData).taskId,
      taskIdea: taskMetadata(taskData).idea,
      taskDescription: taskMetadata(taskData).description,
      timestamp: new Date().toISOString(),
    });

    // Emergency cleanup on error
    await cleanupAfterFailure();
    await markTaskFailed(taskData, error);

    // Send error notification if we have task data
    if (taskData) {
      await notifyFailure({
        task: taskData,
        error,
        step: "automated-workflow",
      });
    } else {
      // Send error notification even without task data
      const fallbackTaskData = {
        idea: "Automated Workflow Error",
        description: "Error occurred before task retrieval",
        sno: "N/A",
        rowId: "N/A",
      };
      await notifyFailure({
        task: fallbackTaskData,
        error,
        step: "automated-workflow",
      });

      // Also send a status update notification
      await notifyStatusUpdate({
        status: "No Tasks Available",
        details:
          "The automated workflow checked for tasks but found none marked as 'Not Posted'. Please add new tasks to the Google Sheet.",
        aiSuggestions: {
          "Checked At": new Date().toLocaleString(),
          Suggestion:
            "Add new content ideas to your Google Sheet with status 'Not Posted'",
        },
      });
    }
  }
};

/**
 * Legacy manual workflow - for backwards compatibility
 */
const runWorkflow = async (
  req: LegacyRequest,
  res: LegacyResponse,
  next?: import("express").NextFunction,
) => {
  try {
    const { title, description } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    // Initialize workflow
    const taskId = Date.now().toString();
    currentWorkflow = {
      taskId,
      status: "running",
      currentStep: "script/generate",
      error: null,
      results: {},
      taskData: { idea: title, description: description || "" },
    };

    logger.info(`🚀 Starting manual workflow for: ${title}`);

    // Step 1: Generate script
    logger.info("→ Step 1: Generating script");
    const scriptResult = await generateScriptForTask({
      idea: title,
      description,
    });
    const script = scriptResult.script;

    if (!script || script.length < 100) {
      throw new Error("Generated script is too short or empty");
    }

    currentWorkflow.results.script = script;
    logger.info("✓ Script generated");

    // Step 2: Check for existing audio files
    logger.info("→ Step 2: Checking for existing audio files");
    let audioFiles;
    const existingAudioFiles = [];

    // Check for conversation audio file
    const audioDir = "audio";
    if (fs.existsSync(audioDir)) {
      const audioFilesList = fs.readdirSync(audioDir);
      const conversationFiles = audioFilesList.filter(
        (file) =>
          file.startsWith("conversation_") &&
          (file.endsWith(".wav") ||
            file.endsWith(".mp3") ||
            file.endsWith(".raw")),
      );

      if (conversationFiles.length > 0) {
        const latestAudio = conversationFiles.sort().pop();
        existingAudioFiles.push({
          conversationFile: path.resolve(
            path.join(audioDir, present(latestAudio, "latestAudio")),
          ),
        });
      }
    }

    if (existingAudioFiles.length > 0) {
      logger.info("✅ Audio file already exists, skipping generation");
      audioFiles = existingAudioFiles[0];
      if (!audioFiles) throw new Error("Expected existing audio");
    } else {
      logger.info("🎤 No existing audio found, generating new audio");
      currentWorkflow.currentStep = "audio/generate";
      audioFiles = await generateAudioWithBatchingStrategy(script);
    }

    if (!audioFiles) throw new Error("Audio generation returned no result");
    currentWorkflow.results.audioFiles = audioFiles;
    logger.info("✓ Audio ready");

    // Step 3: Get base video
    logger.info("→ Step 3: Getting base video");
    currentWorkflow.currentStep = "video/base";
    const baseVideoPath = await getBaseVideo();
    currentWorkflow.results.baseVideoPath = baseVideoPath;
    logger.info("✓ Base video retrieved");

    // Step 4: Check for existing images
    logger.info("→ Step 4: Checking for existing images");
    let images;
    const existingImages = [];

    // Check for existing images (image_0.png to image_4.png)
    for (let i = 0; i < 5; i++) {
      const imagePath = `images/image_${i}.png`;
      if (fs.existsSync(imagePath)) {
        existingImages.push({
          index: i,
          filename: imagePath,
          prompt: `Existing image ${i}`,
        });
        logger.info(`✓ Found existing image: ${imagePath}`);
      }
    }

    if (existingImages.length >= 5) {
      logger.info("✅ All 5 images already exist, skipping generation");
      images = existingImages;
    } else {
      logger.info(
        `🖼️ Found ${existingImages.length}/5 images, generating remaining ${
          5 - existingImages.length
        }`,
      );
      currentWorkflow.currentStep = "images/generate";
      images = await generateImages(null, script);
    }
    currentWorkflow.results.images = images;
    logger.info(`✓ Images ready - ${images.length} images`);

    // Step 5: Assemble video
    logger.info("→ Step 5: Assembling final video");
    currentWorkflow.currentStep = "video/assemble";
    const finalVideo = await assembleVideo(
      baseVideoPath,
      images,
      audioFiles,
      script,
    );
    currentWorkflow.results.finalVideo = finalVideo.videoPath;
    currentWorkflow.results.rootCopyPath = finalVideo.rootCopyPath;
    logger.info("✓ Video assembled");
    logger.info(`📋 Root copy available at: ${finalVideo.rootCopyPath}`);

    // Complete workflow
    currentWorkflow.status = "completed";
    currentWorkflow.currentStep = "completed";
    logger.info(`🎉 Workflow completed successfully: ${finalVideo.videoPath}`);

    res.json({
      success: true as const,
      taskId,
      result: {
        script: script.substring(0, 200) + "...",
        audioGenerated: !!audioFiles.conversationFile,
        imagesCount: images.length,
        baseVideoFound: !!baseVideoPath,
        finalVideo: finalVideo.videoPath,
        rootCopyPath: finalVideo.rootCopyPath,
      },
    });
  } catch (error) {
    const caughtDetails12 = failureInfo(error);

    logger.error("❌ Manual workflow failed:", caughtDetails12.message);
    currentWorkflow.status = "error";
    currentWorkflow.error = caughtDetails12.message;

    res.status(500).json({
      success: false as const,
      error: caughtDetails12.message,
      step: currentWorkflow.currentStep ?? "",
    });
  }
};

/**
 * Get current workflow status
 */
const getWorkflowStatus = (req: LegacyRequest, res: LegacyResponse) => {
  try {
    res.json({
      status: currentWorkflow.status || "idle",
      currentStep: currentWorkflow.currentStep || null,
      error: currentWorkflow.error || null,
      taskId: currentWorkflow.taskId || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const caughtDetails13 = failureInfo(error);

    logger.error("Error getting workflow status:", error);
    res.status(500).json({
      status: "error",
      error: caughtDetails13.message,
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get progress information based on current step
 */
const getProgressInfo = (currentStep: string) => {
  const steps = {
    "sheets/fetch-task": {
      step: 1,
      total: 12,
      description: "Fetching task from Google Sheets",
    },
    "script/generate": {
      step: 2,
      total: 12,
      description: "Generating Q&A conversation script",
    },
    "audio/generate": {
      step: 3,
      total: 12,
      description: "Generating multi-speaker TTS audio",
    },
    "subtitles/generate": {
      step: 4,
      total: 12,
      description: "Creating timed subtitles",
    },
    "video/base": { step: 5, total: 12, description: "Getting base video" },
    "images/generate": {
      step: 6,
      total: 12,
      description: "Generating contextual images",
    },
    "video/compose": {
      step: 7,
      total: 12,
      description: "Composing final video",
    },
    "social/upload": {
      step: 9,
      total: 12,
      description: "Uploading to social media",
    },
    "sheets/update": {
      step: 10,
      total: 12,
      description: "Updating Google Sheet",
    },
    "email/success": {
      step: 11,
      total: 12,
      description: "Sending notification",
    },
    cleanup: { step: 12, total: 12, description: "Cleaning up files" },
    finished: { step: 12, total: 12, description: "Workflow completed" },
    error: {
      step: -1,
      total: 12,
      description: "Workflow encountered an error",
    },
    completed: {
      step: 12,
      total: 12,
      description: "Workflow completed successfully",
    },
    "video/assemble": {
      step: 7,
      total: 12,
      description: "Assembling final video",
    },
  };

  return (
    steps[currentStep as keyof typeof steps] || {
      step: 0,
      total: 12,
      description: "Unknown step",
    }
  );
};

/**
 * Legacy video assembly function for manual workflow
 */
const assembleVideo = async (
  baseVideoPath: string,
  images: LegacyImage[],
  audioFiles: LegacyAudioFiles,
  script: string,
) => {
  const outputPath = `videos/final_${Date.now()}.mp4`;
  const subtitlesPath = `subtitles/subtitles_${Date.now()}.srt`;

  // Create SRT subtitle file
  createSubtitlesFile(script, subtitlesPath);

  // Handle base video path
  if (!fs.existsSync(baseVideoPath)) {
    throw new Error(`Base video file not found: ${baseVideoPath}`);
  }

  // Prepare audio
  const combinedAudioPath = "temp/combined_audio.mp3";
  await combineAudioFiles(audioFiles, combinedAudioPath);

  return new Promise<{ videoPath: string; rootCopyPath: string }>(
    (resolve, reject) => {
      let command = ffmpeg(baseVideoPath)
        .input(combinedAudioPath)
        .audioCodec("aac")
        .videoCodec("libx264");

      // Add images as overlays with improved positioning and timing
      images.forEach((image: LegacyImage, index: number) => {
        const startTime = index * 15; // Show each image for 15 seconds
        command = command.input(image.filename);
      });

      // Create filter complex for image overlays in upper portion
      let filterComplex = "";
      images.forEach((image: LegacyImage, index: number) => {
        const inputIndex = index + 2; // +2 because input 0 is video, input 1 is audio
        const startTime = index * 15;
        const endTime = startTime + 15;

        if (index === 0) {
          filterComplex += `[0:v][${inputIndex}:v]overlay=W*0.1:H*0.1:enable='between(t,${startTime},${endTime})'[v${index}];`;
        } else {
          filterComplex += `[v${
            index - 1
          }][${inputIndex}:v]overlay=W*0.1:H*0.1:enable='between(t,${startTime},${endTime})'[v${index}];`;
        }
      });

      // Add improved subtitles with black background and yellow bold BalsamiqSans-Bold font
      const lastVideoOutput = `[v${images.length - 1}]`;
      const fontFilePath = path.resolve("fonts/BalsamiqSans-Bold.ttf");
      const safeFontPath = fontFilePath
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:");
      const safeSubtitlesPath = subtitlesPath
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'");
      filterComplex += `${lastVideoOutput}subtitles='${safeSubtitlesPath}':force_style='FontFile=${safeFontPath},FontSize=13,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=3,BackColour=&H80000000,Bold=1,Alignment=2,MarginV=125,Outline=3,Spacing=0'[vout]`;

      command
        .complexFilter(filterComplex)
        .outputOptions(["-map", "[vout]", "-map", "1:a"])
        .output(outputPath)
        .on("end", () => {
          logger.info(`✓ Final video created: ${outputPath}`);

          // Save a copy to root directory
          const rootCopyPath = `final_video_${Date.now()}.mp4`;
          try {
            fs.copyFileSync(outputPath, rootCopyPath);
            logger.info(`📋 Root copy saved: ${rootCopyPath}`);
          } catch (copyError) {
            const caughtDetails14 = failureInfo(copyError);

            logger.error(
              `❌ Failed to save root copy:`,
              caughtDetails14.message,
            );
          }

          resolve({
            videoPath: outputPath,
            rootCopyPath: rootCopyPath,
          });
        })
        .on("error", (error) => {
          logger.error("Video assembly error:", error);
          reject(error);
        })
        .run();
    },
  );
};

/**
 * Combine audio files function for legacy workflow
 */
const combineAudioFiles = async (
  audioFiles: LegacyAudioFiles,
  outputPath: string,
) => {
  logger.info("→ Preparing audio for video assembly");

  // Check if audioFiles is the new single-file format
  if (audioFiles && audioFiles.conversationFile) {
    logger.info(
      `→ Using single conversation file: ${audioFiles.conversationFile}`,
    );

    const sourceFile = audioFiles.conversationFile;
    if (fs.existsSync(sourceFile)) {
      fs.copyFileSync(sourceFile, outputPath);
      logger.info(`✓ Audio file prepared: ${outputPath}`);
      return outputPath;
    } else {
      throw new Error(`Conversation file not found: ${sourceFile}`);
    }
  }

  // Fallback to old format if needed
  if (Array.isArray(audioFiles) && audioFiles.length > 0) {
    logger.info(
      `→ Combining ${audioFiles.length} audio files into ${outputPath}`,
    );

    return new Promise<string>((resolve, reject) => {
      let ffmpegCommand = ffmpeg();

      audioFiles.forEach((audioFile) => {
        ffmpegCommand = ffmpegCommand.input(audioFile.file);
      });

      const inputs = audioFiles.map((_, index) => `[${index}:0]`).join("");
      const filterComplex = `${inputs}concat=n=${audioFiles.length}:v=0:a=1[out]`;

      ffmpegCommand
        .complexFilter(filterComplex)
        .outputOptions(["-map", "[out]"])
        .audioCodec("mp3")
        .output(outputPath)
        .on("end", () => {
          logger.info(`✓ Audio files combined: ${outputPath}`);
          resolve(outputPath);
        })
        .on("error", (error) => {
          logger.error("Audio combination error:", error);
          reject(error);
        })
        .run();
    });
  }

  throw new Error("No valid audio files provided for combination");
};

export = {
  runAutomatedWorkflow,
  runWorkflow,
  getWorkflowStatus,
  runCompleteWorkflow,
};

function taskMetadata(task: LegacyTask | null) {
  return {
    taskId: task?.taskId,
    idea: task?.idea,
    description: task?.description,
  };
}
