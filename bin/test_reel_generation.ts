import { isMain } from "../src/compat/entry.js";
import { failureInfo } from "../src/compat/errors.js";
import axios = require("axios");

async function testReelGeneration() {
  try {
    console.log("🚀 Testing reel generation endpoint...");

    // Test reel generation
    const generateResponse = await axios.post(
      "http://localhost:3000/reel/generate",
      {
        topic: "The Future of Artificial Intelligence",
        apiKey: process.env.GEMINI_API_KEY || "your-api-key-here",
        modelName: "gemini-2.0-flash",
      },
    );

    console.log("✅ Generate response:", generateResponse.data);

    const taskId = generateResponse.data.taskId;

    // Poll for status
    let status = "processing";
    while (status === "processing") {
      await new Promise<void>((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds

      const statusResponse = await axios.get(
        `http://localhost:3000/reel/status/${taskId}`,
      );
      status = statusResponse.data.status;
      console.log(`📊 Status: ${status} (${statusResponse.data.progress}%)`);

      if (status === "failed") {
        console.error("❌ Generation failed:", statusResponse.data.error);
        return;
      }
    }

    if (status === "completed") {
      console.log("🎉 Reel generation completed!");
      console.log(
        "📁 Download URL:",
        `http://localhost:3000/reel/download/${taskId}`,
      );
    }
  } catch (error) {
    const caughtDetails0 = failureInfo(error);

    console.error(
      "❌ Test failed:",
      caughtDetails0.response?.data || caughtDetails0.message,
    );
  }
}

// Run test if called directly
if (isMain(module, __filename)) {
  testReelGeneration();
}

export = { testReelGeneration };
