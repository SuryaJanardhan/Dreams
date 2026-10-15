import type { LegacyRequest, LegacyResponse } from "../compat/contracts.js";
import { failureInfo } from "../compat/errors.js";
import legacyModule0 = require("../services/scriptService.js");
const { generateScriptForTask } = legacyModule0;
import logger = require("../config/logger.js");

const generateScriptEndpoint = async (
  req: LegacyRequest,
  res: LegacyResponse,
) => {
  try {
    const { topic } = req.body;

    if (!topic) {
      return res.status(400).json({ error: "Topic is required" });
    }

    logger.info(`📝 Generating script for topic: ${topic}`);

    const scriptResult = await generateScriptForTask({ idea: topic });

    res.json({
      success: true as const,
      script: scriptResult.script,
      rawScript: scriptResult.script,
    });
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    logger.error("Script generation error:", error);
    res.status(500).json({
      error: "Failed to generate script",
      details: caughtDetails1.message,
    });
  }
};

export = {
  generateScriptEndpoint,
};
