import { failureInfo } from "../src/compat/errors.js";
import axios = require("axios");

async function testPostsWorkflow() {
  try {
    console.log("🧪 Testing Posts Workflow endpoint...");

    const response = await axios.post(
      "http://localhost:3000/posts-workflow",
      {},
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    console.log("✅ Response received:");
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    const caughtDetails0 = failureInfo(error);

    console.log("❌ Test failed:");
    if (caughtDetails0.response) {
      console.log("Status:", caughtDetails0.response.status);
      console.log("Data:", caughtDetails0.response.data);
    } else {
      console.log("Error:", caughtDetails0.message);
    }
  }
}

testPostsWorkflow();
