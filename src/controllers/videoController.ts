import type { LegacyRequest, LegacyResponse } from "../compat/contracts.js";
import { failureInfo } from "../compat/errors.js";
import legacyModule0 = require("../services/videoService.js");
const { getBaseVideo } = legacyModule0;
import logger = require("../config/logger.js");

const getBaseVideoEndpoint = async (
  req: LegacyRequest,
  res: LegacyResponse,
) => {
  try {
    const baseVideoUrl = await getBaseVideo();
    res.json({
      success: true as const,
      url: baseVideoUrl,
    });
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    logger.error("Get base video error:", error);
    res.status(500).json({
      error: "Failed to get base video",
      details: caughtDetails1.message,
    });
  }
};

export = {
  getBaseVideoEndpoint,
};
