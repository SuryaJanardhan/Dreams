import { failureInfo } from "../src/compat/errors.js";
import legacyModule0 = require("../src/services/videoProcessingService.js");
const { composeVideo } = legacyModule0;
import fs = require("fs");
import path = require("path");

async function testOptimizedCompression() {
  console.log("🎬 Testing optimized video compression settings...");
  console.log("📊 Target: Reduce 66MB → 45-50MB while maintaining quality");
  console.log("⚙️ Settings: CRF 25, MaxRate 3500k, BufSize 7000k");

  try {
    // Create test subtitles
    const testSubtitles = `1
00:00:00,000 --> 00:00:05,000
Testing Optimized Compression Settings

2
00:00:05,000 --> 00:00:10,000
CRF 25 - Quality maintained

3
00:00:10,000 --> 00:00:15,000
File size should be ~45-50MB

4
00:00:15,000 --> 00:00:20,000
Same resolution: 1080x1920

5
00:00:20,000 --> 00:00:25,000
Same framerate: 30fps
`;

    const subtitlePath = path.join("temp", "compression_test.srt");
    if (!fs.existsSync("temp")) {
      fs.mkdirSync("temp", { recursive: true });
    }
    fs.writeFileSync(subtitlePath, testSubtitles);

    // Create a dummy image for overlay
    const dummyImagePath = path.join("videos", "default-image.jpg");

    console.log("📝 Test subtitles created");
    console.log("🖼️ Using dummy image overlay");
    console.log("🎵 No audio (testing video compression only)");

    // Process video with optimized compression
    const result = await composeVideo(
      "videos/Base-vedio.mp4", // baseVideoPath
      null, // audioPath (none for compression test)
      [{ filename: dummyImagePath }], // images (dummy overlay)
      subtitlePath, // subtitlesPath
      "Compression Test", // title
    );

    // Check file size
    const stats = fs.statSync(result.videoPath);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

    console.log("✅ Optimized compression test completed!");
    console.log("📁 Output:", result.videoPath);
    console.log("📏 File Size:", fileSizeMB, "MB");
    console.log("🎯 Target: < 50MB for Supabase compatibility");

    if (parseFloat(fileSizeMB) < 50) {
      console.log("🎉 SUCCESS: File size is under 50MB limit!");
    } else {
      console.log("⚠️ WARNING: File size still over 50MB limit");
    }

    console.log("\n📊 Compression Results:");
    console.log("   • Original estimate: ~66MB");
    console.log("   • Optimized result:", fileSizeMB, "MB");
    console.log(
      "   • Reduction:",
      (66 - parseFloat(fileSizeMB)).toFixed(2),
      "MB saved",
    );
    console.log("   • Quality: CRF 25 (minimal visual difference)");
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    console.error("❌ Compression test failed:", caughtDetails1.message);
  }
}

testOptimizedCompression();
