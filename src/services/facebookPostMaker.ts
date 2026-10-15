import type { LegacyPostResult } from "../compat/contracts.js";
import { failureInfo } from "../compat/errors.js";
import axios = require("axios");
import fs = require("fs");
import FormData = require("form-data");
import logger = require("../config/logger.js");

/**
 * Facebook Post Maker Service
 * Handles single image and text post creation for Facebook
 */
class FacebookPostMaker {
  declare createPost?: (
    image: string,
    caption: string,
  ) => Promise<LegacyPostResult>;
  baseUrl: "https://graph.facebook.com/v23.0";
  accessToken: string | undefined;
  pageId: string | undefined;

  constructor() {
    this.baseUrl = "https://graph.facebook.com/v23.0";
    this.accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    this.pageId = process.env.FACEBOOK_PAGE_ID;
  }

  /**
   * Create single image post
   * @param {string} imagePath - Path to image file
   * @param {string} message - Post message
   * @returns {Promise<Object>} - Post result
   */
  async createSinglePost(imagePath: string, message: string) {
    try {
      logger.info("📘 Creating Facebook single post...");

      const formData = new FormData();
      formData.append("source", fs.createReadStream(imagePath));
      formData.append("message", message);
      formData.append("access_token", this.accessToken);

      const postUrl = `${this.baseUrl}/${this.pageId}/photos`;

      const response = await axios.post(postUrl, formData, {
        headers: formData.getHeaders(),
      });

      logger.info("✅ Facebook single post created successfully!");
      const facebookUrl = this.getFacebookPostUrl(
        response.data.post_id || response.data.id,
      );
      return {
        success: true as const,
        postId: response.data.post_id || response.data.id,
        permalink: facebookUrl,
        platform: "facebook",
        type: "single",
      };
    } catch (error) {
      const caughtDetails0 = failureInfo(error);

      logger.error("❌ Facebook single post failed:", caughtDetails0.message);
      return {
        success: false as const,
        error: caughtDetails0.message,
        platform: "facebook",
        type: "single",
      };
    }
  }

  /**
   * Create text-only post
   * @param {string} message - Post message
   * @returns {Promise<Object>} - Post result
   */
  async createTextPost(message: string) {
    try {
      logger.info("📝 Creating Facebook text post...");

      const postUrl = `${this.baseUrl}/${this.pageId}/feed`;

      const response = await axios.post(postUrl, {
        message: message,
        access_token: this.accessToken,
      });

      logger.info("✅ Facebook text post created successfully!");
      const facebookUrl = this.getFacebookPostUrl(response.data.id);
      return {
        success: true as const,
        postId: response.data.id,
        permalink: facebookUrl,
        platform: "facebook",
        type: "text",
      };
    } catch (error) {
      const caughtDetails1 = failureInfo(error);

      logger.error("❌ Facebook text post failed:", caughtDetails1.message);
      return {
        success: false as const,
        error: caughtDetails1.message,
        platform: "facebook",
        type: "text",
      };
    }
  }

  /**
   * Extract Facebook post URL from post ID
   * Facebook returns compound IDs in format {page-id}_{post-id}
   * @param {string} postId - Full post ID from Facebook API
   * @returns {string} - Proper Facebook post URL
   */
  getFacebookPostUrl(postId: string) {
    try {
      // Based on working format: https://www.facebook.com/61580337244098/posts/790983717429533_122105119341011241/
      // Use pageId/posts/fullPostId format
      const url = `https://www.facebook.com/${this.pageId}/posts/${postId}/`;
      logger.info(`🔗 Facebook URL constructed: ${url}`);
      return url;
    } catch (error) {
      const caughtDetails2 = failureInfo(error);

      logger.error(
        `❌ Error constructing Facebook URL for ${postId}:`,
        caughtDetails2.message,
      );
      // Return fallback URL
      return `https://www.facebook.com/${this.pageId}/posts/${postId}/`;
    }
  }
}

export = FacebookPostMaker;
