import type { LegacyRequest, LegacyResponse } from "../compat/contracts.js";
import { failureInfo } from "../compat/errors.js";
import legacyModule0 = require("../services/audioService.js");
const { generateAudioWithBatchingStrategy } = legacyModule0;
import logger = require("../config/logger.js");

const generateAudioEndpoint = async (
  req: LegacyRequest,
  res: LegacyResponse,
) => {
  try {
    const { script } = req.body;

    if (!script) {
      return res.status(400).json({ error: "Script is required" });
    }

    logger.info("🎤 Generating audio from script");

    const audioResult = await generateAudioWithBatchingStrategy(script);

    res.json({
      success: true as const,
      audio: audioResult,
    });
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    logger.error("Audio generation error:", error);
    res.status(500).json({
      error: "Failed to generate audio",
      details: caughtDetails1.message,
    });
  }
};

export = {
  generateAudioEndpoint,
};
