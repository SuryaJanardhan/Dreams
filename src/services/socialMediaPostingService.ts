import type { LegacyPostResult } from "../compat/contracts.js";
import { present } from "../compat/guards.js";
import { failureInfo } from "../compat/errors.js";
import InstagramPostMaker = require("./instagramPostMaker.js");
import FacebookPostMaker = require("./facebookPostMaker.js");
import logger = require("../config/logger.js");
import axios = require("axios");

/**
 * Social Media Posting Service
 * Unified service for posting content to multiple platforms
 */
class SocialMediaPostingService {
  instagramService: InstagramPostMaker;
  facebookService: FacebookPostMaker;

  constructor() {
    this.instagramService = new InstagramPostMaker();
    this.facebookService = new FacebookPostMaker();
  }

  /**
   * Post single image to platforms
   * @param {string} imagePath - Path to image file
   * @param {string} caption - Post caption
   * @param {Array} hashtags - Array of hashtags
   * @returns {Promise<Object>} - Results from platforms
   */
  async postSingleImage(imagePath: string, caption: string, hashtags = []) {
    const results: {
      instagram: LegacyPostResult | null;
      facebook: LegacyPostResult | null;
    } = {
      instagram: null,
      facebook: null,
    };

    // Instagram single image
    try {
      const instagramResult = await present(
        this.instagramService.createPost,
        "Instagram createPost",
      ).call(this.instagramService, imagePath, caption);
      results.instagram = {
        success: instagramResult.success,
        url: instagramResult.url || "",
        error: instagramResult.error || null,
      };
    } catch (error) {
      const caughtDetails0 = failureInfo(error);

      results.instagram = {
        success: false as const,
        error: caughtDetails0.message,
      };
    }

    // Facebook single image
    try {
      const facebookResult = await present(
        this.facebookService.createPost,
        "Facebook createPost",
      ).call(this.facebookService, imagePath, caption);
      results.facebook = {
        success: facebookResult.success,
        url: facebookResult.url || "",
        error: facebookResult.error || null,
      };
    } catch (error) {
      const caughtDetails1 = failureInfo(error);

      results.facebook = {
        success: false as const,
        error: caughtDetails1.message,
      };
    }

    return results;
  }

  /**
   * Post text content to platforms
   * @param {string} content - Text content
   * @param {Array} hashtags - Array of hashtags
   * @returns {Promise<Object>} - Results from platforms
   */
  async postTextContent(content: string, hashtags = []) {
    const results: { facebook: LegacyPostResult | null } = {
      facebook: null,
    };

    // Facebook text post
    try {
      const facebookResult: LegacyPostResult =
        await this.facebookService.createTextPost(content);
      results.facebook = {
        success: facebookResult.success,
        url: facebookResult.url || "",
        error: facebookResult.error || null,
      };
    } catch (error) {
      const caughtDetails2 = failureInfo(error);

      results.facebook = {
        success: false as const,
        error: caughtDetails2.message,
      };
    }

    return results;
  }
}

export = SocialMediaPostingService;
