import { isMain } from "../src/compat/entry.js";
import { failureInfo } from "../src/compat/errors.js";
import legacyModule0 = require("../src/services/socialMediaService.js");
const { uploadToYouTube } = legacyModule0;
import path = require("path");

/**
 * Test YouTube upload with dummy video
 */
async function testYouTubeUploadDummy() {
  try {
    console.log("🚀 Starting YouTube upload test with dummy video...");

    // Use a dummy video file (assuming it exists in videos/ directory)
    const dummyVideoPath = path.join(
      __dirname,
      "..",
      "videos",
      "Base-vedio.mp4",
    );

    // Check if dummy video exists, if not, use the base video
    const fs = require("fs");
    let videoPath = dummyVideoPath;
    if (!fs.existsSync(dummyVideoPath)) {
      console.log("⚠️ Dummy video not found, using Base-vedio.mp4");
      videoPath = path.join(__dirname, "..", "videos", "Base-vedio.mp4");
    }

    const title = "Test Dummy Video Upload";
    const description =
      "This is a test upload of a dummy video to verify YouTube upload functionality.";

    console.log(`📹 Using video: ${videoPath}`);
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
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    console.error("❌ Test failed:", caughtDetails1.message);
  }
}

// Run the test if this file is executed directly
if (isMain(module, __filename)) {
  testYouTubeUploadDummy();
}

export = { testYouTubeUploadDummy };
