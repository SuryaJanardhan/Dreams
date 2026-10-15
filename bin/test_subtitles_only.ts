import { isMain } from "../src/compat/entry.js";
import { failureInfo } from "../src/compat/errors.js";
import legacyModule0 = require("../src/services/videoProcessingService.js");
const { composeVideo } = legacyModule0;
import fs = require("fs");
import path = require("path");

/**
 * Test video composition with ONLY subtitles (no images) to verify subtitle visibility
 */
async function testSubtitlesOnly() {
  try {
    console.log("🎬 Testing subtitles-only video (no images)...");
    console.log("📐 Layout: Just subtitles at 50% height");

    // Test files
    const baseVideoPath = path.join("videos", "Base-vedio.mp4");
    const audioPath = null; // No audio for simple test
    const subtitlesPath = path.join("subtitles", "subtitles_only_test.srt");
    const outputPath = path.join(
      "final_video",
      `subtitles_only_${Date.now()}.mp4`,
    );

    // Create simple subtitles
    const simpleSubtitles = `1
00:00:05,000 --> 00:00:10,000
TEST SUBTITLE 1

2
00:00:15,000 --> 00:00:20,000
TEST SUBTITLE 2

3
00:00:25,000 --> 00:00:30,000
TEST SUBTITLE 3

4
00:00:35,000 --> 00:00:40,000
TEST SUBTITLE 4

5
00:00:45,000 --> 00:00:50,000
TEST SUBTITLE 5`;

    // Ensure subtitles directory exists
    if (!fs.existsSync("subtitles")) {
      fs.mkdirSync("subtitles", { recursive: true });
    }

    fs.writeFileSync(subtitlesPath, simpleSubtitles);
    console.log(`📝 Created simple test subtitles: ${subtitlesPath}`);

    // Empty images array - just subtitles
    const testImages: import("../src/compat/contracts.js").LegacyImage[] = [];

    console.log("🖼️ No images - testing subtitles only");
    console.log("📝 Subtitles: Large font at 50% height");

    // Test video composition with only subtitles
    const result = await composeVideo(
      baseVideoPath,
      audioPath,
      testImages,
      subtitlesPath,
      "Subtitles Only Test Video",
    );

    console.log("✅ Subtitles-only test completed!");
    console.log("📹 Output:", result.videoPath);
    console.log("📐 Layout: Subtitles at 50% height, no images");

    // Clean up test files
    if (fs.existsSync(subtitlesPath)) {
      fs.unlinkSync(subtitlesPath);
      console.log("🗑️ Cleaned up test subtitles");
    }

    return result;
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    console.error("❌ Subtitles-only test failed:", caughtDetails1.message);
    throw error;
  }
}

// Run test if called directly
if (isMain(module, __filename)) {
  testSubtitlesOnly()
    .then(() => console.log("🎉 Subtitles-only test completed successfully!"))
    .catch((err) => console.error("💥 Subtitles-only test failed:", err));
}

export = { testSubtitlesOnly };
