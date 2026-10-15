import { isMain } from "../src/compat/entry.js";
import { failureInfo } from "../src/compat/errors.js";
import legacyModule0 = require("../src/services/imageService.js");
const { generateTitleImage } = legacyModule0;
import legacyModule1 = require("../src/services/videoProcessingService.js");
const { composeVideo } = legacyModule1;
import fs = require("fs");
import path = require("path");

/**
 * Test title image generation for "API Security Principles" and video composition
 */
async function testAPISecurityImageAndVideo() {
  try {
    console.log(
      "🧪 Testing API Security Principles image generation and video...",
    );

    // Test title
    const testTitle = "API Security Principles";

    // Step 1: Generate title image
    console.log(`🖼️ Generating title image for: "${testTitle}"`);
    const titleImageResult = await generateTitleImage(testTitle);
    if (!titleImageResult.success) throw new Error(titleImageResult.error);
    const titleImagePath = titleImageResult.imagePath;
    console.log(`✅ Title image generated: ${titleImagePath}`);

    // Verify image exists
    if (fs.existsSync(titleImagePath)) {
      console.log(`📁 Image file confirmed: ${titleImagePath}`);
    } else {
      throw new Error(`Image file not found: ${titleImagePath}`);
    }

    // Step 2: Set up video composition
    const baseVideoPath = path.join("videos", "Base-vedio.mp4");
    const audioPath = null; // No audio for simple test
    const subtitlesPath = path.join("subtitles", "dummy_test_subtitles.srt");

    // Single image that stays throughout the video
    const images = [
      {
        index: 1,
        filename: titleImagePath,
        concept: testTitle,
        timing: {
          startTime: 0,
          endTime: 59, // Full video duration
        },
      },
    ];

    console.log("📐 Video layout configuration:");
    console.log("   - Title image: 9:8 aspect ratio, starts at 5% from top");
    console.log("   - Image stays throughout entire video");
    console.log("   - Subtitles positioned below image area");
    console.log("   - Clean design, no additional text overlays");

    // Test video composition
    const result = await composeVideo(
      baseVideoPath,
      audioPath,
      images,
      subtitlesPath,
      testTitle,
    );

    console.log("✅ API Security video test completed!");
    console.log("📹 Output:", result.videoPath);
    console.log("🖼️ Title image used:", titleImagePath);
    console.log("📐 Final layout:");
    console.log("   - Title image: 5% from top, 9:8 ratio, full duration");
    console.log("   - Subtitles: Positioned below image area");
    console.log("   - Content: API Security Principles");

    return result;
  } catch (error) {
    const caughtDetails2 = failureInfo(error);

    console.error("❌ API Security test failed:", caughtDetails2.message);
    throw error;
  }
}

// Run test if called directly
if (isMain(module, __filename)) {
  testAPISecurityImageAndVideo()
    .then(() => console.log("🎉 API Security test completed successfully!"))
    .catch((err) => console.error("💥 API Security test failed:", err));
}

export = { testAPISecurityImageAndVideo };
