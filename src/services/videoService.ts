import { present } from "../compat/guards.js";
import { failureInfo } from "../compat/errors.js";
import legacyModule0 = require("../config/google.js");
const { getGoogleDriveClient } = legacyModule0;
import path = require("path");
import fs = require("fs");
import logger = require("../config/logger.js");

const getBaseVideo = async () => {
  try {
    logger.info("→ Getting base video from Google Drive");

    const drive = await getGoogleDriveClient();

    // Search for base video files in Google Drive
    const response = await drive.files.list({
      q: "name contains 'base' and (mimeType='video/mp4' or mimeType='video/avi' or mimeType='video/mov')",
      fields: "files(id, name, mimeType)",
      orderBy: "modifiedTime desc",
      pageSize: 1,
    });

    if (!response.data.files || response.data.files.length === 0) {
      throw new Error(
        "No base video found in Google Drive. Please upload a video file with 'base' in the name.",
      );
    }

    const baseVideoFile = present(response.data.files[0], "Base video");
    logger.info(
      `✅ Found base video in Google Drive: ${baseVideoFile.name} (${baseVideoFile.id})`,
    );

    // Download the video file
    const downloadResponse = await drive.files.get(
      {
        fileId: present(baseVideoFile.id, "Drive file ID"),
        alt: "media",
      },
      { responseType: "stream" },
    );

    const localPath = "temp/base_video.mp4";

    // Ensure temp directory exists
    if (!fs.existsSync("temp")) {
      fs.mkdirSync("temp", { recursive: true });
    }

    const writer = fs.createWriteStream(localPath);

    downloadResponse.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on("finish", () => resolve());
      writer.on("error", reject);
    });

    logger.info(`✓ Base video downloaded to: ${localPath}`);
    return path.resolve(localPath);
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    logger.error(
      "❌ Error getting base video from Google Drive:",
      caughtDetails1.message,
    );

    // Check for local base video files as fallback
    const localBaseVideos = [
      "temp/base_video.mp4",
      "base.mp4",
      "videos/base.mp4",
    ];

    for (const videoPath of localBaseVideos) {
      if (fs.existsSync(videoPath)) {
        logger.info(`✅ Using local base video: ${videoPath}`);
        return path.resolve(videoPath); // Return absolute path for local file
      }
    }

    logger.error("❌ No base video found locally or in Google Drive");
    throw new Error(
      "Base video not found. Please upload a video file with 'base' in the name to Google Drive or place it in the project directory.",
    );
  }
};

export = {
  getBaseVideo,
};
