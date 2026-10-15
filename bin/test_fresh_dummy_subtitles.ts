import { isMain } from "../src/compat/entry.js";
import { failureInfo } from "../src/compat/errors.js";
import legacyModule0 = require("../src/services/videoProcessingService.js");
const { composeVideo } = legacyModule0;
import fs = require("fs");
import path = require("path");

/**
 * Test video composition with fresh dummy subtitles
 */
async function testFreshDummySubtitles() {
  try {
    console.log("🎬 Testing with fresh dummy subtitles...");

    // Test files
    const baseVideoPath = path.join("videos", "Base-vedio.mp4");
    const audioPath = null; // No audio for simple test
    const subtitlesPath = path.join(
      "subtitles",
      "fresh_dummy_test_subtitles.srt",
    );
    const outputPath = path.join(
      "final_video",
      `fresh_dummy_test_${Date.now()}.mp4`,
    );

    // Create fresh dummy subtitles with clear, visible text
    const freshSubtitles = `1
00:00:02,000 --> 00:00:07,000
HELLO WORLD - TEST SUBTITLE 1

2
00:00:10,000 --> 00:00:15,000
THIS IS A TEST SUBTITLE 2

3
00:00:18,000 --> 00:00:23,000
SUBTITLES SHOULD BE VISIBLE NOW

4
00:00:26,000 --> 00:00:31,000
TESTING FONT AND POSITIONING

5
00:00:34,000 --> 00:00:39,000
MONTSERRAT BLACK FONT TEST

6
00:00:42,000 --> 00:00:47,000
FINAL SUBTITLE TEST`;

    // Ensure subtitles directory exists
    if (!fs.existsSync("subtitles")) {
      fs.mkdirSync("subtitles", { recursive: true });
    }

    fs.writeFileSync(subtitlesPath, freshSubtitles);
    console.log(`📝 Created fresh dummy subtitles: ${subtitlesPath}`);

    // Test images
    const defaultImagePath = path.join("images", "default-image.jpg");
    const testImages = [
      {
        filename: defaultImagePath,
        timing: { startTime: 2, endTime: 12 },
      },
      {
        filename: defaultImagePath,
        timing: { startTime: 15, endTime: 25 },
      },
      {
        filename: defaultImagePath,
        timing: { startTime: 28, endTime: 38 },
      },
      {
        filename: defaultImagePath,
        timing: { startTime: 41, endTime: 51 },
      },
    ];

    console.log("🖼️ Images positioned between 3% to 40% of video");
    console.log("📝 Subtitles positioned with MarginV=337");

    // Test video composition
    const result = await composeVideo(
      baseVideoPath,
      audioPath,
      testImages,
      subtitlesPath,
      "Fresh Dummy Test Video",
    );

    console.log("✅ Fresh dummy video processing test completed!");
    console.log("📹 Output:", result.videoPath);
    console.log("📐 Layout verification:");
    console.log("   - Images: 3% to 40% range (57-768px from top)");
    console.log("   - Subtitles: Positioned with MarginV=337");

    // Keep subtitles for verification
    console.log(
      "📝 Fresh subtitles file preserved for verification:",
      subtitlesPath,
    );

    return result;
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    console.error(
      "❌ Fresh dummy video processing test failed:",
      caughtDetails1.message,
    );
    throw error;
  }
}

// Run test if called directly
if (isMain(module, __filename)) {
  testFreshDummySubtitles()
    .then(() => console.log("🎉 Fresh dummy test completed successfully!"))
    .catch((err) => console.error("💥 Fresh dummy test failed:", err));
}

export = { testFreshDummySubtitles };
