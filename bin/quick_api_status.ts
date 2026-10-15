require("dotenv").config();
import logger = require("../src/config/logger.js");

// Quick API key status checker
async function checkAPIKeyStatus() {
  logger.info("🔑 QUICK API KEY STATUS CHECK");
  logger.info("==============================");

  const keys = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_API_KEY_FOR_IMAGES_1: process.env.GEMINI_API_KEY_FOR_IMAGES_1,
    GEMINI_API_KEY_FOR_IMAGES_2: process.env.GEMINI_API_KEY_FOR_IMAGES_2,
  };

  for (const [name, key] of Object.entries(keys)) {
    if (key) {
      logger.info(`✅ ${name}: ...${key.slice(-10)} (${key.length} chars)`);
    } else {
      logger.warn(`❌ ${name}: NOT SET`);
    }
  }

  logger.info("\n📋 RECOMMENDATION:");
  logger.info("- Replace GEMINI_API_KEY (expired)");
  logger.info("- Test image generation with working keys");
  logger.info("- Or temporarily use fallback images only");
}

checkAPIKeyStatus();
