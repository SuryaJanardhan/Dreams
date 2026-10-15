import { failureInfo } from "../src/compat/errors.js";
// Quick test for Instagram permalink API
require("dotenv").config();
import axios = require("axios");

async function testInstagramPermalink() {
  const mediaId = "18101003581536386"; // Use a recent media ID from our test
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN; // Try Facebook token for permalink

  console.log("🔍 Checking environment...");
  console.log("📝 Media ID:", mediaId);
  console.log("🔑 Access Token exists:", !!accessToken);

  if (!accessToken) {
    console.log("❌ No FACEBOOK_ACCESS_TOKEN found");
    return;
  }

  try {
    console.log("🔗 Testing Instagram permalink API...");
    const url = `https://graph.facebook.com/v18.0/${mediaId}?fields=permalink&access_token=${accessToken}`;
    console.log(`📡 URL: ${url.replace(accessToken, "HIDDEN")}`);

    const response = await axios.get(url);
    console.log(
      "✅ Success! Response:",
      JSON.stringify(response.data, null, 2),
    );
  } catch (error) {
    const caughtDetails0 = failureInfo(error);

    console.log(
      "❌ Error:",
      caughtDetails0.response?.status,
      caughtDetails0.response?.data || caughtDetails0.message,
    );
  }
}

testInstagramPermalink();
