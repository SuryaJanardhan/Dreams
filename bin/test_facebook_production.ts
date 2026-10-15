import { isMain } from "../src/compat/entry.js";
import { failureInfo } from "../src/compat/errors.js";
require("dotenv").config();
import legacyModule0 = require("../src/services/socialMediaService.js");
const { uploadToFacebook } = legacyModule0;
import path = require("path");

async function testFacebookProductionFunction() {
  try {
    console.log("🧪 Testing production Facebook upload function...");

    // Use the existing base video as dummy test video
    const dummyVideoPath = path.join("videos", "Base-vedio.mp4");

    // Check if dummy video exists
    const fs = require("fs");
    if (!fs.existsSync(dummyVideoPath)) {
      console.log(
        "❌ Dummy video not found. Please ensure Base-vedio.mp4 exists in videos folder.",
      );
      return;
    }

    console.log("📹 Using existing base video for Facebook upload test");

    // Test the production uploadToFacebook function
    console.log("📘 Starting production Facebook upload test...");
    const result = await uploadToFacebook(
      dummyVideoPath,
      "🤖 TEST: Production Function Test - Educational Content Automation",
      "This is a test using the production uploadToFacebook function.",
    );

    console.log(
      "✅ Production Facebook upload test result:",
      JSON.stringify(result, null, 2),
    );

    if (result.success) {
      console.log("🎉 SUCCESS: Facebook post created!");
      console.log(`🔗 Facebook Post URL: ${result.url}`);
      console.log(
        `📝 URL is complete: ${
          result.url.startsWith("http") ? "✅ YES" : "❌ NO"
        }`,
      );
    } else {
      console.log("❌ FAILED: Facebook upload failed");
      console.log(`Error: ${result.error}`);
    }
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    console.error(
      "❌ Production Facebook upload test failed:",
      caughtDetails1.message,
    );
    console.error("Stack:", caughtDetails1.stack);
  }
}

// Run the test
if (isMain(module, __filename)) {
  testFacebookProductionFunction();
}

export = { testFacebookProductionFunction };
