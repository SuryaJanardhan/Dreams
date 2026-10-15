import express = require("express");
import legacyModule0 = require("../controllers/workflowController.js");
const { runWorkflow, runAutomatedWorkflow, getWorkflowStatus } = legacyModule0;
import fs = require("fs");
import path = require("path");

const router = express.Router();
// FFmpeg test route for debugging
router.use(require("./testFFmpeg"));

// function ensureDirs(dirs) {
//   dirs.forEach((dir) => {
//     if (!fs.existsSync(dir)) {
//       fs.mkdirSync(dir, { recursive: true });
//     }
//   });
// }

// POST /workflow/auto - Automated workflow (pulls from Google Sheets)
router.post("/auto", (req, res, next) => {
  // ensureDirs([
  //   path.join(__dirname, "../../audio"),
  //   path.join(__dirname, "../../final_video"),
  //   path.join(__dirname, "../../images"),
  //   path.join(__dirname, "../../scripts"),
  //   path.join(__dirname, "../../subtitles"),
  // ]);
  return runAutomatedWorkflow(req, res, next);
});

// POST /workflow/run - Manual workflow execution (legacy)
router.post("/run", runWorkflow);

// GET /workflow/status - Get current workflow status
router.get("/status", getWorkflowStatus);

export = router;
