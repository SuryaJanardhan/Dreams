import { failureInfo } from "../src/compat/errors.js";
require("dotenv").config();
import logger = require("../src/config/logger.js");
import legacyModule0 = require("../src/services/imageService.js");
const { generateImageWithGemini } = legacyModule0;

async function testSpecificAPIKey() {
  logger.info("🔍 FOCUSED API KEY TEST");
  logger.info("=======================");

  const apiKeys = {
    main: process.env.GEMINI_API_KEY,
    images1: process.env.GEMINI_API_KEY_FOR_IMAGES_1,
    images2: process.env.GEMINI_API_KEY_FOR_IMAGES_2,
  };

  logger.info("🔑 Testing each API key individually...");

  for (const [keyName, keyValue] of Object.entries(apiKeys)) {
    if (!keyValue) {
      logger.warn(`⚠️ ${keyName}: Not configured`);
      continue;
    }

    logger.info(`\n🧪 Testing ${keyName}: ...${keyValue.slice(-10)}`);

    try {
      const imagePath = await generateImageWithGemini(
        "Generate a simple blue circle on white background",
        `test_${keyName}`,
        keyValue,
      );

      if (imagePath) {
        logger.info(`✅ ${keyName}: SUCCESS - Image generated`);
      } else {
        logger.warn(`⚠️ ${keyName}: PARTIAL - Used fallback`);
      }
    } catch (error) {
      const caughtDetails1 = failureInfo(error);

      if (caughtDetails1.message.includes("API key expired")) {
        logger.error(`❌ ${keyName}: EXPIRED - ${caughtDetails1.message}`);
      } else if (caughtDetails1.message.includes("fetch failed")) {
        logger.warn(`⚠️ ${keyName}: NETWORK ISSUE - ${caughtDetails1.message}`);
      } else {
        logger.error(`❌ ${keyName}: ERROR - ${caughtDetails1.message}`);
      }
    }
  }
}

// Run the focused test
testSpecificAPIKey()
  .then(() => {
    logger.info("\n🎯 Focused API key test completed!");
  })
  .catch((error: unknown) => {
    const caughtDetails2 = failureInfo(error);

    logger.error(`💥 Test failed: ${caughtDetails2.message}`);
  });
