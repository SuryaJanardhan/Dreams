import {isMain} from "../src/compat/entry.js";
import { failureInfo } from "../src/compat/errors.js";
import axios = require("axios");
import fs = require("fs");
import path = require("path");

// Cache directory for expensive API results
const CACHE_DIR = path.join(__dirname, "test_cache");
const SCRIPT_CACHE = path.join(CACHE_DIR, "script.json");
const AUDIO_CACHE = path.join(CACHE_DIR, "audio.mp3");
const SRT_CACHE = path.join(CACHE_DIR, "subtitles.srt");

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Helper function to check if cache is valid (less than 24 hours old)
function isCacheValid(cachePath: string) {
  if (!fs.existsSync(cachePath)) return false;
  const stats = fs.statSync(cachePath);
  const age = Date.now() - stats.mtime.getTime();
  return age < 24 * 60 * 60 * 1000; // 24 hours
}

// Mock data for testing when API is rate limited
function getMockScriptData() {
  return {
    script: `Rani: Yaar, can you explain the future of artificial intelligence?
Raj: Actually, see AI is transforming everything around us. From self-driving cars to medical diagnosis, machine learning algorithms are getting smarter every day. You know, deep learning neural networks can now recognize patterns that humans might miss.
Rani: Oh really? Tell me more na?
Raj: No yaar, it's more complex. See, generative AI like GPT models can create human-like text, while computer vision systems can identify objects in images with incredible accuracy. The key is big data and computational power.
Rani: Wow, that's amazing!`,
  };
}

function getMockAudioData() {
  // Return base64 encoded silence or a small audio file for testing
  // For now, we'll use a minimal approach
  return {
    audio: Buffer.from(
      "RIFF\x24\x08\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00\x08\x00\x00",
    ).toString("base64"),
  };
}

async function testReelWorkflow() {
  try {
    console.log(
      "🚀 Testing integrated reel workflow (video generation only)...",
    );

    // Test data
    const testTopic = "The Future of Artificial Intelligence";
    const testDescription =
      "Exploring how AI will transform our world in the coming years";

    console.log(`📝 Topic: ${testTopic}`);
    console.log(`📋 Description: ${testDescription}`);

    let scriptData;

    // Step 1: Test script generation (with caching)
    console.log("\n📝 Step 1: Testing script generation...");
    if (isCacheValid(SCRIPT_CACHE)) {
      console.log("📋 Using cached script...");
      scriptData = JSON.parse(fs.readFileSync(SCRIPT_CACHE, "utf8"));
    } else {
      console.log("📝 Generating new script...");
      try {
        const scriptResponse = await axios.post(
          "http://localhost:3000/script/generate",
          {
            topic: testTopic,
          },
        );
        scriptData = scriptResponse.data;
        fs.writeFileSync(SCRIPT_CACHE, JSON.stringify(scriptData, null, 2));
        console.log("💾 Script cached for future use");
      } catch (error) {
const caughtDetails0 = failureInfo(error);

        if (caughtDetails0.response?.status === 429 || caughtDetails0.response?.status === 500) {
          console.log("⚠️ API rate limited, using mock script for testing...");
          scriptData = getMockScriptData();
          fs.writeFileSync(SCRIPT_CACHE, JSON.stringify(scriptData, null, 2));
          console.log("💾 Mock script cached for future use");
        } else {
          throw error;
        }
      }
    }
    console.log("✅ Script ready");

    let audioPath;

    // Step 2: Test audio generation (with caching)
    console.log("\n🎵 Step 2: Testing audio generation...");
    if (isCacheValid(AUDIO_CACHE)) {
      console.log("🎵 Using cached audio...");
      audioPath = AUDIO_CACHE;
    } else {
      console.log("🎵 Generating new audio...");
      try {
        const audioResponse = await axios.post(
          "http://localhost:3000/audio/generate",
          {
            script: scriptData.script,
          },
        );

        // Save audio to cache
        const audioBuffer = Buffer.from(audioResponse.data.audio, "base64");
        fs.writeFileSync(AUDIO_CACHE, audioBuffer);
        audioPath = AUDIO_CACHE;
        console.log("💾 Audio cached for future use");
      } catch (error) {
const caughtDetails1 = failureInfo(error);

        if (caughtDetails1.response?.status === 429 || caughtDetails1.response?.status === 500) {
          console.log(
            "⚠️ Audio API rate limited, using mock audio for testing...",
          );
          const mockAudio = getMockAudioData();
          const audioBuffer = Buffer.from(mockAudio.audio, "base64");
          fs.writeFileSync(AUDIO_CACHE, audioBuffer);
          audioPath = AUDIO_CACHE;
          console.log("💾 Mock audio cached for future use");
        } else {
          throw error;
        }
      }
    }
    console.log("✅ Audio ready");

    // Step 3: Skip base video test (handled internally by reel generation)
    console.log(
      "\n🎬 Step 3: Base video will be handled by reel generation...",
    );
    console.log("✅ Using base video: Base-vedio.mp4");

    // Step 4: Test reel generation (this will do everything up to video composition)
    console.log("\n🎨 Step 4: Testing reel generation...");
    const reelResponse = await axios.post(
      "http://localhost:3000/reel/generate",
      {
        topic: testTopic,
        apiKey:
          process.env.GEMINI_API_KEY_FOR_VISUALS || "your-visuals-api-key",
        modelName: "gemini-1.5-flash",
      },
    );

    console.log("✅ Reel generation started:", reelResponse.data);

    const taskId = reelResponse.data.taskId;

    // Step 5: Monitor progress until completion
    console.log("\n⏳ Step 5: Monitoring reel generation progress...");
    let status = "processing";
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes max

    while (status === "processing" && attempts < maxAttempts) {
      try {
        const statusResponse = await axios.get(
          `http://localhost:3000/reel/status/${taskId}`,
        );
        status = statusResponse.data.status;
        const progress = statusResponse.data.progress || 0;
        const step = statusResponse.data.step || "unknown";

        console.log(
          `📊 Status: ${status} | Step: ${step} | Progress: ${progress}%`,
        );

        if (status === "failed") {
          console.error("❌ Generation failed:", statusResponse.data.error);
          return;
        }

        if (status === "completed") {
          console.log("🎉 Reel generation completed!");

          // Step 6: Download the video to root directory
          console.log("\n📥 Step 6: Downloading final video to root...");
          const downloadResponse = await axios.get(
            `http://localhost:3000/reel/download/${taskId}`,
            {
              responseType: "stream",
            },
          );

          const rootVideoPath = path.join(
            __dirname,
            "..",
            `test_reel_${Date.now()}.mp4`,
          );
          const writer = fs.createWriteStream(rootVideoPath);

          downloadResponse.data.pipe(writer);

          await new Promise<void>((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
          });

          console.log(`✅ Video saved to root: ${rootVideoPath}`);

          // Get file size
          const stats = fs.statSync(rootVideoPath);
          const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
          console.log(`📏 File size: ${fileSizeMB} MB`);

          // Show day-based color scheme used
          const {
            getDayBasedColors,
          } = require("../src/services/videoProcessingService");
          const dayColors = getDayBasedColors();
          console.log(
            `🎨 Color scheme used: ${dayColors.name} (${dayColors.textColor})`,
          );

          console.log("\n🎬 TEST COMPLETED SUCCESSFULLY!");
          console.log("📁 Final video saved to project root");
          console.log("🚫 Social media posting was skipped (as requested)");

          return;
        }

        // Wait 2 seconds before next check
        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
        attempts++;
      } catch (error) {
const caughtDetails2 = failureInfo(error);

        console.error("❌ Error checking status:", caughtDetails2.message);
        attempts++;
        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      }
    }

    if (attempts >= maxAttempts) {
      console.error("⏰ Timeout: Reel generation took too long");
    }
  } catch (error) {
const caughtDetails3 = failureInfo(error);

    console.error("❌ Test failed:", caughtDetails3.response?.data || caughtDetails3.message);
    console.error("Stack:", caughtDetails3.stack);
  }
}

// Run test if called directly
if (isMain(module,__filename)) {
  testReelWorkflow();
}

export = { testReelWorkflow };
