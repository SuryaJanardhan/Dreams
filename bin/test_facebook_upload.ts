import { failureInfo } from "../src/compat/errors.js";
import legacyModule0 = require("../src/services/socialMediaService.js");
const { uploadToFacebook } = legacyModule0;
import path = require("path");

async function testFacebookUpload() {
  try {
    console.log("🧪 Testing Facebook upload...");

    // Use a test video file (assuming one exists in videos folder)
    const testVideoPath = path.join("videos", "Base-vedio.mp4");

    // Check if test video exists
    const fs = require("fs");
    if (!fs.existsSync(testVideoPath)) {
      console.log("❌ Test video not found. Please create a test video first.");
      return;
    }

    const result = await uploadToFacebook(
      testVideoPath,
      "Test Facebook Upload - Educational Content",
      "This is a test upload to verify Facebook integration is working properly.",
    );

    console.log("✅ Facebook upload test result:", result);
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    console.error("❌ Facebook upload test failed:", caughtDetails1.message);
  }
}

// Run the test
testFacebookUpload();
