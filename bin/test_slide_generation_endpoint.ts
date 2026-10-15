import { isMain } from "../src/compat/entry.js";
import { failureInfo } from "../src/compat/errors.js";
import axios = require("axios");
import fs = require("fs");
import path = require("path");

/**
 * Test the deployed slide generation endpoint
 */
async function testSlideGenerationEndpoint() {
  try {
    console.log("🧪 Testing deployed slide generation endpoint...");

    // Test data
    const testData = {
      title: "Test Slide Title",
      content:
        "This is a test content for the slide generation endpoint. It should render properly with the new image and Playfair Display font.",
    };

    // Make request to the endpoint
    const response = await axios.post(
      "https://slide-microservice.onrender.com/generate",
      testData,
      {
        responseType: "arraybuffer",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    // Save the generated image (or error response)
    const outputPath = path.join(__dirname, "..", "test_slide_output.png");
    fs.writeFileSync(outputPath, response.data);

    console.log("✅ Slide generation test successful!");
    console.log(`📁 Generated image saved to: ${outputPath}`);
    console.log(
      `📊 Image size: ${(response.data.length / 1024).toFixed(2)} KB`,
    );
    console.log(`📋 Response headers:`, response.headers);
  } catch (error) {
    const caughtDetails0 = failureInfo(error);

    console.error("❌ Slide generation test failed:", caughtDetails0.message);

    if (caughtDetails0.response) {
      console.error("Response status:", caughtDetails0.response.status);
      console.error("Response headers:", caughtDetails0.response.headers);

      // Save error response for debugging
      const errorPath = path.join(__dirname, "..", "test_slide_error.html");
      fs.writeFileSync(errorPath, String(caughtDetails0.response.data));
      console.error(`📁 Error response saved to: ${errorPath}`);
      console.error(
        `📊 Error response size: ${(
          String(caughtDetails0.response.data).length / 1024
        ).toFixed(2)} KB`,
      );
    }
  }
}

/**
 * Test font status endpoint
 */
async function testFontStatusEndpoint() {
  try {
    console.log("🔤 Testing font status endpoint...");

    const response = await axios.get(
      "https://slide-microservice.onrender.com/font-status",
    );

    console.log("✅ Font status retrieved successfully!");
    console.log("📋 Font status:", JSON.stringify(response.data, null, 2));
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    console.error("❌ Font status test failed:", caughtDetails1.message);
  }
}

/**
 * Test home endpoint
 */
async function testHomeEndpoint() {
  try {
    console.log("🏠 Testing home endpoint...");

    const response = await axios.get("http://localhost:5000/");

    console.log("✅ Home endpoint test successful!");
    console.log("📝 Response:", response.data);
  } catch (error) {
    const caughtDetails2 = failureInfo(error);

    console.error("❌ Home endpoint test failed:", caughtDetails2.message);
  }
}

// Run all tests
async function runAllTests() {
  console.log("🚀 Starting slide generation endpoint tests...\n");

  await testHomeEndpoint();
  console.log("");

  await testFontStatusEndpoint();
  console.log("");

  await testSlideGenerationEndpoint();
  console.log("");

  console.log("🎉 All tests completed!");
}

// Check if this script is run directly
if (isMain(module, __filename)) {
  runAllTests();
}

export = {
  testSlideGenerationEndpoint,
  testFontStatusEndpoint,
  testHomeEndpoint,
  runAllTests,
};
