import { historicalImages } from "../compat/historical.js";
import type { LegacyRequest, LegacyResponse } from "../compat/contracts.js";
import { failureInfo } from "../compat/errors.js";
import legacyModule0 = require("../services/imageService.js");
const { generateImages } = historicalImages(legacyModule0);
import logger = require("../config/logger.js");

const generateImagesEndpoint = async (
  req: LegacyRequest,
  res: LegacyResponse,
) => {
  try {
    const { script } = req.body;

    if (!script) {
      return res.status(400).json({ error: "Script is required" });
    }

    logger.info("🖼️ Generating images from script");

    const images = await generateImages(null, script);

    res.json({
      success: true as const,
      images: images,
    });
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    logger.error("Image generation error:", error);
    res.status(500).json({
      error: "Failed to generate images",
      details: caughtDetails1.message,
    });
  }
};

export = {
  generateImagesEndpoint,
};
