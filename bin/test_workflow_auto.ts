import { isMain } from "../src/compat/entry.js";
import { failureInfo } from "../src/compat/errors.js";
import { spawn } from "child_process";
import axios = require("axios");

/**
 * Test the workflow/auto endpoint locally (simulating GitHub Actions)
 */
async function testWorkflowAuto() {
  console.log(
    "🚀 Testing workflow/auto endpoint (GitHub Actions simulation)...",
  );
  console.log(
    "📋 This test simulates what happens in .github/workflows/webpack.yml",
  );
  console.log("");

  // Start the server (similar to "node server.js &" in GitHub Actions)
  console.log("🔄 Starting server...");
  const serverProcess = spawn("node", ["server.js"], {
    stdio: ["inherit", "inherit", "inherit"],
    detached: false,
  });

  // Wait for server to start (similar to sleep 5 in GitHub Actions)
  console.log("⏳ Waiting 5 seconds for server to start...");
  await new Promise<void>((resolve) => setTimeout(resolve, 5000));

  try {
    // Check if server is responding
    console.log("🔍 Checking if server is responding...");
    const healthCheck = await axios.get("http://localhost:3000/");
    console.log("✅ Server is responding");

    // Trigger workflow/auto (similar to "curl -X POST http://localhost:3000/workflow/auto" in GitHub Actions)
    console.log("🎬 Triggering /workflow/auto endpoint...");
    const response = await axios.post(
      "http://localhost:3000/workflow/auto",
      {},
      {
        timeout: 300000, // 5 minutes timeout (similar to sleep 300 in GitHub Actions)
      },
    );

    console.log("✅ Workflow/auto completed successfully!");
    console.log("📊 Response:", response.data);
  } catch (error) {
    const caughtDetails0 = failureInfo(error);

    console.error("❌ Workflow/auto test failed:", caughtDetails0.message);
    if (caughtDetails0.response) {
      console.error("Response status:", caughtDetails0.response.status);
      console.error("Response data:", caughtDetails0.response.data);
    }
  } finally {
    // Stop the server (similar to "kill $SERVER_PID" in GitHub Actions)
    console.log("🛑 Stopping server...");
    serverProcess.kill("SIGTERM");

    // Wait a bit for cleanup
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    console.log("✅ Test completed!");
  }
}

// Run the test if this file is executed directly
if (isMain(module, __filename)) {
  testWorkflowAuto().catch(console.error);
}

export = { testWorkflowAuto };
