import express = require("express");
import legacyModule0 = require("../controllers/videoController.js");
const { getBaseVideoEndpoint } = legacyModule0;

const router = express.Router();

// GET /video/base - Get base video from Google Drive
router.get("/base", getBaseVideoEndpoint);

export = router;
