import { failureInfo } from "../compat/errors.js";
import fs = require("fs");
import path = require("path");
import logger = require("../config/logger.js");
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios = require("axios");

/**
 * IMAGE SERVICE - Using Gemini API
 *
 * Purpose: Generate title images via Google Gemini API
 * Model: gemini-2.0-flash
 * Method: Direct image generation with text prompt
 * Response: Image file (PNG)
 */

/*
// ================================================================
// ARCHIVED WORKER API FUNCTIONS - COMMENTED OUT
// ================================================================

const generateImageFromWorker = async (prompt, outputDir: string | null = null) => {
  try {
    const workerUrl =
      "https://quiet-scene-4d5f.chintalajanardhan2004.workers.dev/";

    logger.info(`🎨 Generating image via Worker API...`);
    logger.info(`📝 Prompt: ${prompt.substring(0, 100)}...`);

    // Send POST request to worker endpoint
    const response = await axios.post(
      workerUrl,
      { prompt: prompt },
      {
        headers: {
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
        timeout: 60000, // 60 second timeout
      }
    );

    // Save the image
    const timestamp = Date.now();
    const baseDir = outputDir || "images";
    const imagePath = path.resolve(`${baseDir}/title_image_${timestamp}.png`);

    // Ensure output directory exists
    const imageDir = path.dirname(imagePath);
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }

    fs.writeFileSync(imagePath, response.data);
    logger.info(`✅ Image saved successfully: ${imagePath}`);

    return imagePath;
  } catch (error) {
    logger.error(
      `❌ Worker API image generation failed:`,
      error.message || error
    );
    throw error;
  }
};

// ================================================================
*/

/**
 * Generate image using Gemini Image API
 * @param {string} prompt - Image generation prompt
 * @param {string} outputDir - Optional output directory
 * @returns {Promise<string>} - Path to generated image
 */
const generateImageWithGemini = async (
  prompt: string,
  outputDir: string | null = null,
  ..._unused: unknown[]
) => {
  try {
    const apiKey =
      process.env.GEMINI_API_KEY_FOR_VISUALS ||
      process.env.GEMINI_API_KEY_FOR_IMAGES_1 ||
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("No Gemini API key available");
    }

    logger.info(`🎨 Generating image with Gemini...`);
    logger.info(`🔑 Using API key ending with: ...${apiKey.slice(-10)}`);
    logger.info(`📝 Prompt: ${prompt.substring(0, 100)}...`);

    const genAI = new GoogleGenerativeAI(apiKey);
    const imageConfiguration: import("@google/generative-ai").GenerationConfig & {
      responseModalities: string[];
    } = { responseModalities: ["image"], temperature: 0.7 };
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: imageConfiguration,
    });

    const response = await model.generateContent(prompt);

    // Check if we got image data
    if (!response.response.candidates || !response.response.candidates[0]) {
      throw new Error("No image data received from Gemini");
    }

    const candidate = response.response.candidates[0];
    const parts = candidate.content.parts;

    for (const part of parts) {
      if (part.inlineData) {
        const imageData = part.inlineData.data;
        const buffer = Buffer.from(imageData, "base64");

        const timestamp = Date.now();
        const baseDir = outputDir || "images";
        const imagePath = path.resolve(
          `${baseDir}/title_image_${timestamp}.png`,
        );

        // Ensure output directory exists
        const imageDir = path.dirname(imagePath);
        if (!fs.existsSync(imageDir)) {
          fs.mkdirSync(imageDir, { recursive: true });
        }

        fs.writeFileSync(imagePath, buffer);
        logger.info(`✅ Image saved successfully: ${imagePath}`);
        return imagePath;
      }
    }

    throw new Error("No image data in Gemini response");
  } catch (error) {
    const caughtDetails0 = failureInfo(error);

    logger.error(
      `❌ Gemini image generation failed:`,
      caughtDetails0.message || error,
    );
    throw error;
  }
};

/**
 * MAIN FUNCTION: Generate title image using Gemini API
 * @param {string} title - Video title text
 * @param {string} outputDir - Optional output directory (defaults to 'images')
 * @returns {Promise<Object>} - {success, imagePath, usedDefault, error}
 */
const generateTitleImage = async (
  title: string,
  outputDir: string | null = null,
  ..._unused: unknown[]
) => {
  try {
    logger.info(`🎨 Starting title image generation for: "${title}"`);

    // Escape any special characters in the title for the prompt
    const cleanedTitle = title.replace(/"/g, "'").replace(/\n/g, " ");

    // Simple prompt for Gemini - white background with centered black text
    const prompt = `White background with black text in center saying "${cleanedTitle}". Bold large text. Professional. Clear.`;

    // Generate image using Gemini
    const imagePath = await generateImageWithGemini(prompt, outputDir);
    logger.info(`✅ Title image generated successfully: ${imagePath}`);

    return {
      success: true as const,
      imagePath: imagePath,
      usedDefault: false,
      error: null,
    };
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    logger.error(`❌ Image generation failed: ${caughtDetails1.message}`);

    // Fallback to default image
    try {
      const defaultImagePath = path.resolve("videos/default-image.jpg");
      if (fs.existsSync(defaultImagePath)) {
        logger.info(`✅ Using fallback image: ${defaultImagePath}`);

        return {
          success: true as const,
          imagePath: defaultImagePath,
          usedDefault: true,
          error: null,
        };
      }
    } catch (fallbackError) {
      const caughtDetails2 = failureInfo(fallbackError);

      logger.error(`❌ Fallback also failed: ${caughtDetails2.message}`);
    }

    return {
      success: false as const,
      imagePath: null,
      usedDefault: false,
      error: "All image generation and fallback options failed",
    };
  }
};

/**
 * Validate if image file exists and is accessible
 * @param {string} imagePath - Path to image file
 * @returns {boolean} - True if valid image file
 */
const validateImage = (imagePath: string) => {
  try {
    if (!imagePath || !fs.existsSync(imagePath)) {
      return false;
    }

    const stats = fs.statSync(imagePath);
    return stats.isFile() && stats.size > 0;
  } catch (error) {
    const caughtDetails3 = failureInfo(error);

    logger.warn(`⚠️ Image validation failed: ${caughtDetails3.message}`);
    return false;
  }
};

/**
 * Clean up old generated images to prevent disk space issues
 * @param {number} maxAge - Maximum age in milliseconds (default: 24 hours)
 */
const cleanupOldImages = async (maxAge = 24 * 60 * 60 * 1000) => {
  try {
    const imageDir = path.resolve("images");
    if (!fs.existsSync(imageDir)) {
      return;
    }

    const files = fs.readdirSync(imageDir);
    const now = Date.now();
    let cleanedCount = 0;

    for (const file of files) {
      if (file.startsWith("title_image_") || file.startsWith("fallback_")) {
        const filePath = path.join(imageDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.birthtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      logger.info(`🧹 Cleaned up ${cleanedCount} old images`);
    }
  } catch (error) {
    const caughtDetails4 = failureInfo(error);

    logger.warn(`⚠️ Image cleanup failed: ${caughtDetails4.message}`);
  }
};

export = {
  // Primary workflow function
  generateTitleImage,

  // Core image generation function
  generateImageWithGemini,

  // Utility functions
  validateImage,
  cleanupOldImages,
};

/*
=====================================================
ARCHIVED FUNCTIONS - KEPT FOR REFERENCE
=====================================================

// Old Worker API functions commented out
// const generateImageFromWorker = async (prompt, outputDir: string | null = null) => { ... }

This function has been replaced with Gemini API approach.
*/
