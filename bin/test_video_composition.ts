import { isMain } from "../src/compat/entry.js";
import { failureInfo } from "../src/compat/errors.js";
import legacyModule0 = require("../src/services/videoProcessingService.js");
const { composeVideo } = legacyModule0;
import fs = require("fs");
import path = require("path");

/**
 * Test video composition with updated image handling
 */
async function testVideoComposition() {
  try {
    console.log("🎬 Testing video composition with updated image handling...");

    // Test files
    const baseVideoPath = path.join("videos", "Base-vedio.mp4");
    const audioPath = null; // No audio for simple test
    const subtitlesPath = path.join("subtitles", "test_subtitles.srt");
    const outputPath = path.join(
      "videos",
      `test_composition_${Date.now()}.mp4`,
    );

    // Create dummy subtitles
    const dummySubtitles = `1
00:00:00,000 --> 00:00:10,000
Welcome to our technical tutorial!

2
00:00:10,000 --> 00:00:20,000
Learn about modern development practices.

3
00:00:20,000 --> 00:00:30,000
Explore cutting-edge technologies.

4
00:00:30,000 --> 00:00:40,000
Master the fundamentals of coding.

5
00:00:40,000 --> 00:00:50,000
Build amazing applications today!`;

    // Ensure subtitles directory exists
    if (!fs.existsSync("subtitles")) {
      fs.mkdirSync("subtitles", { recursive: true });
    }

    fs.writeFileSync(subtitlesPath, dummySubtitles);
    console.log(`📝 Created dummy subtitles: ${subtitlesPath}`);

    // Create test images array with default image
    const defaultImagePath = path.join("videos", "default-image.jpg");
    const testImages = [
      {
        filename: defaultImagePath,
        timing: { startTime: 5, endTime: 15 },
      },
      {
        filename: defaultImagePath,
        timing: { startTime: 20, endTime: 30 },
      },
      {
        filename: defaultImagePath,
        timing: { startTime: 35, endTime: 45 },
      },
    ];

    // Test video composition
    const result = await composeVideo(
      baseVideoPath,
      audioPath,
      testImages,
      subtitlesPath,
      "Test Video Composition",
    );

    console.log("✅ Video composition test completed!");
    console.log("📹 Output:", result.videoPath);

    // Clean up test files
    if (fs.existsSync(subtitlesPath)) {
      fs.unlinkSync(subtitlesPath);
      console.log("🗑️ Cleaned up test subtitles");
    }

    return result;
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    console.error("❌ Video composition test failed:", caughtDetails1.message);
    throw error;
  }
}

// Run test if called directly
if (isMain(module, __filename)) {
  testVideoComposition()
    .then(() => console.log("🎉 Test completed successfully!"))
    .catch((err) => console.error("💥 Test failed:", err));
}

export = { testVideoComposition };
