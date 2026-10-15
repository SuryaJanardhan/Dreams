import { isMain } from "../src/compat/entry.js";
import { failureInfo } from "../src/compat/errors.js";
import { createRequire } from "node:module";
// This historical module is absent in the baseline; preserve its native loading failure.
const VideoPostingService: unknown = createRequire(__filename)(
  "./src/services/videoPostingService.js",
);
import logger = require("../src/config/logger.js");

/**
 * Test script to validate service separation
 * Tests video posting services
 */
async function testServiceSeparation() {
  console.log("🧪 Testing Service Separation...");

  try {
    // Test Video Posting Service
    console.log("\n📹 Testing Video Posting Service...");
    if (typeof VideoPostingService !== "function")
      throw new TypeError("VideoPostingService is not a constructor");
    const videoService: unknown = Reflect.construct(VideoPostingService, []);
    if (
      typeof videoService !== "object" ||
      videoService === null ||
      !("validateVideoForPlatform" in videoService) ||
      !("uploadVideoToPlatforms" in videoService) ||
      typeof videoService.validateVideoForPlatform !== "function" ||
      typeof videoService.uploadVideoToPlatforms !== "function"
    )
      throw new TypeError("Historical video posting interface unavailable");

    // Test video validation
    const testVideoPath = "./videos/Base-vedio.mp4";
    const validationResult = await videoService.validateVideoForPlatform(
      testVideoPath,
      "youtube",
    );
    console.log("Video validation result:", validationResult);

    // Test multi-platform upload (will fail without real credentials, but tests the structure)
    const platforms = ["youtube"];
    const uploadResult = await videoService.uploadVideoToPlatforms(
      platforms,
      testVideoPath,
      "Test Video Title",
      "Test video description for service separation testing",
    );
    console.log("Video upload result:", uploadResult);
  } catch (error) {
    const caughtDetails0 = failureInfo(error);

    console.log("❌ Video service test failed:", caughtDetails0.message);
  }

  console.log("\n✅ Service separation test completed");
}

// Run the test if this file is executed directly
if (isMain(module, __filename)) {
  testServiceSeparation().catch(console.error);
}

export = { testServiceSeparation };
