import { failureInfo } from "../src/compat/errors.js";
import wav2lipService = require("../src/services/wav2lipService.js");
import path = require("path");
import fs = require("fs");
import logger = require("../src/config/logger.js");

/**
 * HQ Wav2Lip Test Script
 * This script runs Wav2Lip with "Elite" settings to test the limits of expressiveness and head movement.
 * Requirements: test.mp4 (face) and test.mp3 (audio) in the root directory.
 */
async function runHQTest() {
  const facePath = path.resolve("test.mp4");
  const audioPath = path.resolve("test.mp3");
  const outputPath = path.resolve("results/test_hq_result.mp4");

  // 1. Validation
  if (!fs.existsSync(facePath) || !fs.existsSync(audioPath)) {
    logger.error(
      "❌ Missing test files! Please ensure test.mp4 and test.mp3 are in the root directory.",
    );
    process.exit(1);
  }

  if (!fs.existsSync("results")) {
    fs.mkdirSync("results");
  }

  logger.info("🚀 Starting EXTREME Wav2Lip Test...");
  logger.info(`📍 Face: ${facePath}`);
  logger.info(`📍 Audio: ${audioPath}`);

  try {
    // 2. Run with Elite Settings
    const result = await wav2lipService.syncLip(
      audioPath,
      facePath,
      outputPath,
      {
        // These settings maximize expressiveness and handle head tilts
        pads: [0, 30, 0, 0], // More vertical space for expressive jaw movement
        nosmooth: false, // Enable temporal smoothing for realistic head/tilting
        restorer: "gfpgan", // Enable premium face restoration (requires GFPGAN checkpoint)
      },
    );

    logger.info(`✅ Test Complete! Output saved to: ${result}`);
    logger.info(
      "💡 Note: If restoration failed, ensure GFPGANv1.4.pth is in wav2lip/checkpoints/",
    );
  } catch (error) {
    const caughtDetails0 = failureInfo(error);

    logger.error(`❌ Test Failed: ${caughtDetails0.message}`);
  }
}

// Ensure results dir is clean or at least exists
if (!fs.existsSync("results")) fs.mkdirSync("results");

runHQTest();
