import { failureInfo } from "../src/compat/errors.js";
import voiceboxService = require("../src/services/voiceboxService.js");
import path = require("path");
import fs = require("fs");

async function testAudio() {
  console.log("🎤 Starting local audio quality test...");

  const text =
    "Application Programming Interfaces, commonly known as APIs, are the silent backbone of modern software architecture. What this means is that they allow different systems to communicate seamlessly, effectively bridging the gap between disparate data sources and user interfaces.";
  const refAudio = path.resolve(__dirname, "../assets/Base-audio.mp3");
  const outAudio = path.resolve("test_quality_output.wav");

  if (!fs.existsSync(refAudio)) {
    console.error(
      "❌ Base-audio.mp3 not found! Please ensure it is in the root directory.",
    );
    process.exit(1);
  }

  try {
    console.log(
      "🗣️ Generating audio with normal speed (1.0) and normalization...",
    );
    // Reverting to normal speed as requested
    const resultPath = await voiceboxService.generateClonedVoice(
      text,
      refAudio,
      outAudio,
      null,
      null,
      1.0,
    );
    console.log(`✅ Success! Audio saved to: ${resultPath}`);

    const stats = fs.statSync(resultPath);
    console.log(`📊 File Size: ${(stats.size / 1024).toFixed(2)} KB`);
  } catch (err) {
    const caughtDetails0 = failureInfo(err);

    console.error("❌ Audio generation failed:", err);
  }
}

testAudio();
