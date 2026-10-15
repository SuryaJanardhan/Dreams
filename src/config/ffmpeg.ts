import ffmpegPath from "ffmpeg-static";
import ffmpeg = require("fluent-ffmpeg");
import fs = require("fs");

// Configure FFmpeg path using ffmpeg-static
if (ffmpegPath) {
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
  console.log("✅ FFmpeg configured successfully with ffmpeg-static");
} else {
  console.warn(
    "⚠️ ffmpeg-static not found. Some video processing features may not work.",
  );
}

// Fallback paths for manual installation
const manualFfmpegPath =
  "C:\\ffmpeg\\ffmpeg-8.0-essentials_build\\bin\\ffmpeg.exe";
const manualFfprobePath =
  "C:\\ffmpeg\\ffmpeg-8.0-essentials_build\\bin\\ffprobe.exe";

// Only set manual paths if ffmpeg-static failed and manual paths exist
if (!ffmpegPath && fs.existsSync(manualFfmpegPath)) {
  ffmpeg.setFfmpegPath(manualFfmpegPath);
  ffmpeg.setFfprobePath(manualFfprobePath);
  console.log("✅ FFmpeg configured with manual installation");
}

// Define ffprobePath for export (use ffmpeg-static path or manual path)
const ffprobePath = ffmpegPath
  ? ffmpegPath.replace("ffmpeg.exe", "ffprobe.exe")
  : manualFfprobePath;

export = {
  ffmpegPath,
  ffprobePath,
};
