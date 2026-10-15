import express = require("express");
import legacyModule0 = require("../controllers/imageController.js");
const { generateImagesEndpoint } = legacyModule0;

const router = express.Router();

// POST /images/generate - Generate educational images
router.post("/generate", generateImagesEndpoint);

export = router;
