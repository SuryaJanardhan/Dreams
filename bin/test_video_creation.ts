import { failureInfo } from "../src/compat/errors.js";
import legacyModule0 = require("./create_test_video.js");
const { createTestVideoWithDefaultImage } = legacyModule0;

/**
 * Simple test runner for the video creation functionality
 */
async function runTest() {
  console.log("🎬 Starting Test Video Creation...");
  console.log("📋 Test Configuration:");
  console.log("   • Base Video: videos/Base-vedio.mp4");
  console.log("   • Default Image: videos/default-image.jpg");
  console.log("   • Font: fonts/Montserrat-Black.ttf");
  console.log("   • Font Size: 13px");
  console.log("   • Font Color: Yellow (#FFFF00)");
  console.log("   • Background: Dark Black");
  console.log("   • Padding: 2px");
  console.log("   • Image Position: Top 2.5%, Perfectly Centered (x=90)");
  console.log("   • Subtitle Position: 15% from bottom (85% from top)");
  console.log("   • Font Style: Montserrat-Black, Bold, Yellow, SRT Format");
  console.log("   • Subtitle Style: Yellow text, Black BG, Rounded corners");
  console.log("   • Duration: 50 seconds");
  console.log("   • Subtitles: 5 dummy entries");
  console.log("");

  try {
    const result = await createTestVideoWithDefaultImage();

    console.log("✅ Test Video Created Successfully!");
    console.log("📊 Results:");
    console.log(`   • Output File: ${result.outputPath}`);
    console.log(`   • Duration: ${result.duration} seconds`);
    console.log(`   • Subtitles: ${result.subtitles} entries`);
    console.log(`   • Font: ${result.font}`);
    console.log(`   • Font Size: ${result.fontSize}px`);
    console.log(`   • Image Position: ${result.imagePosition}`);
    console.log(`   • Resolution: ${result.resolution}`);
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    console.error("❌ Test Failed:");
    console.error(`   Error: ${caughtDetails1.message}`);
    process.exit(1);
  }
}

// Run the test
runTest();
