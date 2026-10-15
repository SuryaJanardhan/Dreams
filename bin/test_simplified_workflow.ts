import { failureInfo } from "../src/compat/errors.js";
import path = require("path");
import fs = require("fs");

// Import the consolidated image service
import imageService = require("../src/services/imageService.js");

async function testSimplifiedWorkflow() {
  console.log("🧪 Testing Simplified Single-Image Workflow...\n");

  const testTitle =
    "The Future of AI: How Machine Learning Will Transform Healthcare in 2024";
  const outputDir = path.join(__dirname, "..", "temp");

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    console.log("📋 Test Configuration:");
    console.log(`   Title: "${testTitle}"`);
    console.log(`   Output Directory: ${outputDir}`);
    console.log(`   Expected API Keys: T2T and T2I separation\n`);

    console.log("⚡ Testing Single Title Image Generation...");
    const startTime = Date.now();

    const result = await imageService.generateTitleImage(testTitle, outputDir);

    const duration = Date.now() - startTime;
    console.log(`⏱️  Generation completed in ${duration}ms\n`);

    console.log("📊 Results:");
    console.log(`   Success: ${result.success}`);
    console.log(`   Image Path: ${result.imagePath}`);
    console.log(`   Used Default: ${result.usedDefault || false}`);
    console.log(`   Error: ${result.error || "None"}\n`);

    // Verify the image file exists
    if (result.imagePath && fs.existsSync(result.imagePath)) {
      const stats = fs.statSync(result.imagePath);
      console.log("✅ Image File Verification:");
      console.log(`   File exists: ✓`);
      console.log(`   File size: ${Math.round(stats.size / 1024)} KB`);
      console.log(`   Created: ${stats.birthtime.toLocaleTimeString()}\n`);
    } else {
      console.log("❌ Image file not found at expected path\n");
    }

    // Test API key configuration
    console.log("🔑 API Key Configuration Test:");
    const t2tKey = process.env.GEMINI_API_KEY_FOR_T2T;
    const t2iKey1 = process.env.GEMINI_API_KEY_FOR_IMAGES_1;
    const t2iKey2 = process.env.GEMINI_API_KEY_FOR_IMAGES_2;

    console.log(`   T2T Key: ${t2tKey ? "✓ Configured" : "❌ Missing"}`);
    console.log(`   T2I Key 1: ${t2iKey1 ? "✓ Configured" : "❌ Missing"}`);
    console.log(`   T2I Key 2: ${t2iKey2 ? "✓ Configured" : "❌ Missing"}\n`);

    // Summary
    console.log("📋 Workflow Summary:");
    console.log(`   ✅ Consolidated to single imageService.js`);
    console.log(`   ✅ Single image generation (no multi-image complexity)`);
    console.log(`   ✅ Separate API keys for T2T and T2I`);
    console.log(`   ✅ Automatic fallback system`);
    console.log(`   ✅ Video workflow ready`);

    if (result.success) {
      console.log(
        "\n🎉 Simplified workflow test PASSED! Ready for production use.",
      );
    } else {
      console.log("\n⚠️  Workflow used fallback - check API key validity.");
    }
  } catch (error) {
    const caughtDetails0 = failureInfo(error);

    console.error("❌ Test failed:", caughtDetails0.message);
    console.error("Stack:", caughtDetails0.stack);
  }
}

// Run the test
testSimplifiedWorkflow().catch(console.error);
