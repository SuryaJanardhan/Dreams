import { failureInfo } from "../src/compat/errors.js";
import axios = require("axios");

(async () => {
  try {
    console.log("🧪 Testing posts workflow with empty body...");
    console.log("📡 Calling: POST http://localhost:3000/posts-workflow");

    const response = await axios.post(
      "http://localhost:3000/posts-workflow",
      {},
    );

    console.log("✅ Response received:");
    console.log("Status:", response.status);
    console.log("Data:", JSON.stringify(response.data, null, 2));
  } catch (error) {
    const caughtDetails0 = failureInfo(error);

    console.error("❌ Test failed:");
    if (caughtDetails0.response) {
      console.error("Status:", caughtDetails0.response.status);
      console.error("Data:", caughtDetails0.response.data);
    } else {
      console.error("Error:", caughtDetails0.message);
    }
  }
})();
