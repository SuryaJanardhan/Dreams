import express = require("express");
import legacyModule0 = require("../controllers/audioController.js");
const { generateAudioEndpoint } = legacyModule0;

const router = express.Router();

// POST /audio/generate - Generate conversation audio
router.post("/generate", generateAudioEndpoint);

export = router;
