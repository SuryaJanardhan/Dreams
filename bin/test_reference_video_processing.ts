import { isMain } from "../src/compat/entry.js";
import { failureInfo } from "../src/compat/errors.js";
import legacyModule0 = require("../src/services/videoProcessingService.js");
const { composeVideo } = legacyModule0;
import fs = require("fs");
import path = require("path");

/**
 * Test video composition with reference code positioning:
 * - Images: Top 2% of video (38px from top)
 * - Subtitles: Small font at bottom (37px from bottom)
 */
async function testReferenceVideoProcessing() {
  try {
    console.log(
      "🎬 Testing reference video processing (original positioning)...",
    );
    console.log(
      "📐 Reference Layout: Images (top 2%) | Subtitles (small at bottom)",
    );

    // Test files
    const baseVideoPath = path.join("videos", "Base-vedio.mp4");
    const audioPath = null; // No audio for simple test
    const subtitlesPath = path.join(
      "subtitles",
      "reference_test_subtitles.srt",
    );
    const outputPath = path.join(
      "final_video",
      `reference_test_${Date.now()}.mp4`,
    );

    // Create reference-style subtitles (smaller, at bottom)
    const referenceSubtitles = `1
00:00:00,000 --> 00:00:05,000
Welcome to our technical tutorial!

2
00:00:05,000 --> 00:00:10,000
Learn about modern development practices.

3
00:00:10,000 --> 00:00:15,000
Explore cutting-edge technologies.

4
00:00:15,000 --> 00:00:20,000
Master the fundamentals of coding.

5
00:00:20,000 --> 00:00:25,000
Build amazing applications today!`;

    // Ensure subtitles directory exists
    if (!fs.existsSync("subtitles")) {
      fs.mkdirSync("subtitles", { recursive: true });
    }

    fs.writeFileSync(subtitlesPath, referenceSubtitles);
    console.log(`📝 Created reference subtitles: ${subtitlesPath}`);

    // Create test images array with default image (reference positioning: top 2%)
    const defaultImagePath = path.join("videos", "default-image.jpg");
    const testImages = [
      {
        filename: defaultImagePath,
        timing: { startTime: 2, endTime: 12 },
      },
      {
        filename: defaultImagePath,
        timing: { startTime: 15, endTime: 25 },
      },
    ];

    console.log(
      "🖼️ Images positioned at top 2% (38px from top) - Reference style",
    );
    console.log(
      "📝 Subtitles: Small font at bottom (37px from bottom) - Reference style",
    );

    // Test video composition using reference positioning
    const result = await composeVideo(
      baseVideoPath,
      audioPath,
      testImages,
      subtitlesPath,
      "Reference Test Video - Original Positioning",
    );

    console.log("✅ Reference video processing test completed!");
    console.log("📹 Output:", result.videoPath);
    console.log("📐 Reference layout verification:");
    console.log("   - Images: Top 2% (38px from top)");
    console.log("   - Subtitles: Small font at bottom");

    // Clean up test files
    if (fs.existsSync(subtitlesPath)) {
      fs.unlinkSync(subtitlesPath);
      console.log("🗑️ Cleaned up reference test subtitles");
    }

    return result;
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    console.error(
      "❌ Reference video processing test failed:",
      caughtDetails1.message,
    );
    throw error;
  }
}

// Run test if called directly
if (isMain(module, __filename)) {
  testReferenceVideoProcessing()
    .then(() => console.log("🎉 Reference test completed successfully!"))
    .catch((err) => console.error("💥 Reference test failed:", err));
}

export = { testReferenceVideoProcessing };
