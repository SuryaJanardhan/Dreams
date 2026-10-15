import express = require("express");
const router = express.Router();
import legacyModule0 = require("../controllers/reelController.js");
const { generateReelContent, getReelStatus, downloadReel } = legacyModule0;

// POST /reel/generate - Generate reel content from topic
router.post("/generate", generateReelContent);

// GET /reel/status/:taskId - Get reel generation status
router.get("/status/:taskId", getReelStatus);

// GET /reel/download/:taskId - Download generated reel
router.get("/download/:taskId", downloadReel);

export = router;
