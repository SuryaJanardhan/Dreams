import type { LegacyPostResult } from "../compat/contracts.js";
import { failureInfo } from "../compat/errors.js";
import axios = require("axios");
import fs = require("fs");
import path = require("path");
import FormData = require("form-data");
import logger = require("../config/logger.js");

/**
 * Instagram Post Maker Service
 * Handles single image post creation and uploading to Instagram using v23.0 API
 */
class InstagramPostMaker {
  declare createPost?: (
    image: string,
    caption: string,
  ) => Promise<LegacyPostResult>;
  baseUrl: "https://graph.facebook.com";
  apiVersion: "v23.0";
  accessToken: string | undefined;
  accountId: string | undefined;

  constructor() {
    this.baseUrl = "https://graph.facebook.com"; // Using Facebook Graph API for better token handling
    this.apiVersion = "v23.0"; // Updated to latest version
    this.accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    this.accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  }

  /**
   * Upload image to Instagram
   * @param {string} imageUrl - URL or local path to image
   * @param {string} caption - Post caption
   * @returns {Promise<string>} - Media ID
   */
  async uploadImage(imageUrl: string, caption = "") {
    try {
      // Check if it's a URL or local path
      const isUrl =
        imageUrl.startsWith("http://") || imageUrl.startsWith("https://");

      if (!isUrl && !fs.existsSync(imageUrl)) {
        throw new Error(`Image file not found: ${imageUrl}`);
      }

      const uploadUrl = `${this.baseUrl}/${this.apiVersion}/${this.accountId}/media`;

      if (isUrl) {
        // For URLs, use the image_url parameter instead of uploading file content
        logger.info(`📤 Using public URL for Instagram upload: ${imageUrl}`);

        const response = await axios.post(uploadUrl, {
          image_url: imageUrl,
          caption: caption,
          access_token: this.accessToken,
        });

        if (!response.data.id) {
          throw new Error("No media ID returned from Instagram API");
        }

        return response.data.id;
      } else {
        // For local files, use form data upload
        logger.info(`📤 Using local file for Instagram upload: ${imageUrl}`);

        const formData = new FormData();
        formData.append("image", fs.createReadStream(imageUrl));
        formData.append("caption", caption);
        formData.append("access_token", this.accessToken);

        const response = await axios.post(uploadUrl, formData, {
          headers: {
            ...formData.getHeaders(),
          },
          timeout: 30000, // 30 second timeout
        });

        if (!response.data.id) {
          throw new Error("No media ID returned from Instagram API");
        }

        return response.data.id;
      }
    } catch (error) {
      const caughtDetails0 = failureInfo(error);

      logger.error("❌ Instagram image upload failed:", {
        message: caughtDetails0.message,
        status: caughtDetails0.response?.status,
        data: caughtDetails0.response?.data,
        imageUrl: imageUrl,
      });
      throw error;
    }
  }

  /**
   * Create single image post
   * @param {string} imagePath - Path to image file
   * @param {string} caption - Post caption
   * @returns {Promise<Object>} - Post result
   */
  async createSinglePost(imagePath: string, caption: string) {
    try {
      logger.info("📸 Creating Instagram single post...");

      // Upload image
      const mediaId = await this.uploadImage(imagePath, caption);

      // Publish post
      const publishUrl = `${this.baseUrl}/${this.apiVersion}/${this.accountId}/media_publish`;

      const response = await axios.post(publishUrl, {
        creation_id: mediaId,
        access_token: this.accessToken,
      });

      logger.info("✅ Instagram single post created successfully!");
      return {
        success: true as const,
        postId: response.data.id,
        permalink: `https://www.instagram.com/p/${response.data.code}/`,
        platform: "instagram",
        type: "single",
      };
    } catch (error) {
      const caughtDetails1 = failureInfo(error);

      logger.error("❌ Instagram single post failed:", caughtDetails1.message);
      return {
        success: false as const,
        error: caughtDetails1.message,
        platform: "instagram",
        type: "single",
      };
    }
  }

  async getInstagramPermalink(mediaId: string) {
    try {
      logger.info(`🔗 Getting Instagram permalink for media: ${mediaId}`);

      const url = `${this.baseUrl}/${this.apiVersion}/${mediaId}`;
      const response = await axios.get(url, {
        params: {
          fields: "permalink",
          access_token: this.accessToken,
        },
      });

      if (response.data && response.data.permalink) {
        logger.info(
          `✅ Instagram permalink retrieved: ${response.data.permalink}`,
        );
        return response.data.permalink;
      } else {
        throw new Error("No permalink found in response");
      }
    } catch (error) {
      const caughtDetails2 = failureInfo(error);

      logger.error(
        `❌ Failed to get Instagram permalink for ${mediaId}:`,
        caughtDetails2.message,
      );
      // Return null so the calling code can handle the fallback
      return null;
    }
  }
}

export = InstagramPostMaker;
