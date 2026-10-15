import express = require("express");
import legacyModule0 = require("../controllers/scriptController.js");
const { generateScriptEndpoint } = legacyModule0;

const router = express.Router();

// POST /script/generate - Generate conversation script
router.post("/generate", generateScriptEndpoint);

export = router;
