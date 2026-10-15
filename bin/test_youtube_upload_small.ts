import { isMain } from "../src/compat/entry.js";
import { failureInfo } from "../src/compat/errors.js";
import legacyModule0 = require("../src/services/socialMediaService.js");
const { uploadToYouTube } = legacyModule0;
import ffmpegPath from "ffmpeg-static";
import ffmpeg = require("fluent-ffmpeg");
import fs = require("fs");
import path = require("path");

// Configure FFmpeg
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Create a small dummy video for testing YouTube upload
 */
async function createDummyVideo() {
  const outputPath = path.join(
    __dirname,
    "..",
    "temp",
    `test_video_${Date.now()}.mp4`,
  );

  console.log("🎬 Creating small dummy video for testing...");

  return new Promise<string>((resolve, reject) => {
    ffmpeg()
      .input("color=c=blue:s=640x360:d=5")
      .inputFormat("lavfi")
      .videoFilter(
        "drawtext=text='YouTube Upload Test':fontsize=30:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2",
      )
      .outputOptions(["-c:v libx264", "-t 5", "-pix_fmt yuv420p", "-y"])
      .output(outputPath)
      .on("end", () => {
        console.log(`✅ Dummy video created: ${outputPath}`);
        resolve(outputPath);
      })
      .on("error", (error) => {
        console.error("❌ Failed to create dummy video:", error);
        reject(error);
      })
      .run();
  });
}

/**
 * Test YouTube upload with a small dummy video
 */
async function testYouTubeUploadSmallVideo() {
  let videoPath = null;

  try {
    console.log("🚀 Starting YouTube upload test with small dummy video...");

    // Create a small dummy video
    videoPath = await createDummyVideo();

    // Verify the video file exists and get its size
    if (!fs.existsSync(videoPath)) {
      throw new Error("Dummy video was not created successfully");
    }

    const stats = fs.statSync(videoPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`📊 Video file size: ${fileSizeMB} MB`);

    const title = `Test Upload - Small Video ${
      new Date().toISOString().split("T")[0]
    }`;
    const description = `This is a test upload of a small dummy video to verify YouTube upload functionality. File size: ${fileSizeMB} MB. Created on ${new Date().toLocaleString()}.`;

    console.log(`📹 Using video: ${videoPath}`);
    console.log(`📝 Title: ${title}`);
    console.log(`📝 Description: ${description.substring(0, 100)}...`);

    const result = await uploadToYouTube(videoPath, title, description);

    if (result.success) {
      console.log("✅ YouTube upload successful!");
      console.log(`🔗 Video URL: ${result.url}`);
      console.log(`🆔 Video ID: ${result.videoId}`);
      console.log(`📊 Uploaded file size: ${fileSizeMB} MB`);
    } else {
      console.log("❌ YouTube upload failed!");
      console.log(`Error: ${result.error}`);
    }

    return result;
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    console.error("❌ Test failed:", caughtDetails1.message);
    return { success: false as const, error: caughtDetails1.message };
  } finally {
    // Clean up the dummy video
    if (videoPath && fs.existsSync(videoPath)) {
      try {
        fs.unlinkSync(videoPath);
        console.log("🧹 Cleaned up dummy video file");
      } catch (cleanupError) {
        const caughtDetails2 = failureInfo(cleanupError);

        console.warn(
          "⚠️ Failed to clean up dummy video:",
          caughtDetails2.message,
        );
      }
    }
  }
}

/**
 * Test YouTube upload with existing small video file
 */
async function testYouTubeUploadWithExistingVideo() {
  try {
    console.log("🚀 Starting YouTube upload test with existing small video...");

    // Look for small video files in the temp directory or videos directory
    const possiblePaths = [
      path.join(__dirname, "..", "temp", "test_video.mp4"),
      path.join(__dirname, "..", "videos", "small_test.mp4"),
      // Add more potential small video paths if needed
    ];

    let videoPath = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        videoPath = testPath;
        break;
      }
    }

    if (!videoPath) {
      console.log("⚠️ No existing small video found, creating one...");
      videoPath = await createDummyVideo();
    }

    const stats = fs.statSync(videoPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    const title = `Test Upload - Existing Video ${
      new Date().toISOString().split("T")[0]
    }`;
    const description = `This is a test upload using an existing video file to verify YouTube upload functionality. File size: ${fileSizeMB} MB. Created on ${new Date().toLocaleString()}.`;

    console.log(`📹 Using video: ${videoPath}`);
    console.log(`📊 File size: ${fileSizeMB} MB`);
    console.log(`📝 Title: ${title}`);

    const result = await uploadToYouTube(videoPath, title, description);

    if (result.success) {
      console.log("✅ YouTube upload successful!");
      console.log(`🔗 Video URL: ${result.url}`);
      console.log(`🆔 Video ID: ${result.videoId}`);
    } else {
      console.log("❌ YouTube upload failed!");
      console.log(`Error: ${result.error}`);
    }

    return result;
  } catch (error) {
    const caughtDetails3 = failureInfo(error);

    console.error("❌ Test failed:", caughtDetails3.message);
    return { success: false as const, error: caughtDetails3.message };
  }
}

// Run the test if this file is executed directly
if (isMain(module, __filename)) {
  // You can choose which test to run
  testYouTubeUploadSmallVideo()
    .then(() => {
      console.log("🎉 Test completed");
      process.exit(0);
    })
    .catch((error: unknown) => {
      const caughtDetails4 = failureInfo(error);

      console.error("💥 Test failed with error:", error);
      process.exit(1);
    });
}

export = {
  testYouTubeUploadSmallVideo,
  testYouTubeUploadWithExistingVideo,
  createDummyVideo,
};
