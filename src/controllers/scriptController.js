const { generateScriptForTask } = require("../services/scriptService");
const logger = require("../config/logger");

const generateScriptEndpoint = async (req, res) => {
  try {
    const { topic } = req.body;

    if (!topic) {
      return res.status(400).json({ error: "Topic is required" });
    }

    logger.info(`📝 Generating script for topic: ${topic}`);

    const scriptResult = await generateScriptForTask({ idea: topic });

    res.json({
      success: true,
      script: scriptResult.script,
      rawScript: scriptResult.script,
    });
  } catch (error) {
    logger.error("Script generation error:", error);
    res.status(500).json({
      error: "Failed to generate script",
      details: error.message,
    });
  }
};

module.exports = {
  generateScriptEndpoint,
};
