import { isMain } from "../src/compat/entry.js";
import { failureInfo, providerMessage } from "../src/compat/errors.js";
import axios = require("axios");
require("dotenv").config();

// Mock logger
const logger = {
  info: (msg: string) => console.log(`ℹ️ ${msg}`),
  warn: (msg: string) => console.log(`⚠️ ${msg}`),
  error: (msg: string) => console.log(`❌ ${msg}`),
};

async function diagnoseFacebookSetup() {
  try {
    console.log("🔍 Diagnosing Facebook API setup...\n");

    // Check environment variables
    const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    const pageId = process.env.FACEBOOK_PAGE_ID;

    console.log("📋 Environment Variables:");
    console.log(
      `   FACEBOOK_ACCESS_TOKEN: ${accessToken ? "✅ Set" : "❌ Missing"}`,
    );
    console.log(`   FACEBOOK_PAGE_ID: ${pageId || "❌ Missing"}\n`);

    if (!accessToken || !pageId) {
      console.log(
        "❌ Missing required environment variables. Please check your .env file.",
      );
      return;
    }

    // Test 1: Verify access token and permissions
    console.log("🧪 Test 1: Verifying Access Token & Permissions...");
    try {
      const tokenDebugUrl = `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${accessToken}`;
      const tokenResponse = await axios.get(tokenDebugUrl);

      console.log("✅ Access token is valid");
      console.log(`   App ID: ${tokenResponse.data.data.app_id}`);
      console.log(`   User ID: ${tokenResponse.data.data.user_id}`);
      console.log(
        `   Expires: ${
          tokenResponse.data.data.expires_at
            ? new Date(
                tokenResponse.data.data.expires_at * 1000,
              ).toLocaleString()
            : "Never"
        }`,
      );

      const scopes = tokenResponse.data.data.scopes || [];
      console.log(`   Permissions: ${scopes.join(", ")}`);

      // Check for required permissions
      const requiredPermissions = ["pages_manage_posts", "pages_show_list"];
      const missingPermissions = requiredPermissions.filter((perm) =>
        scopes.includes(perm),
      );

      if (missingPermissions.length > 0) {
        console.log(
          `⚠️  Missing permissions: ${missingPermissions.join(", ")}`,
        );
        console.log("   This may cause posting to fail.");
      } else {
        console.log("✅ All required permissions present");
      }
      console.log("");
    } catch (error) {
      const caughtDetails0 = failureInfo(error);

      console.log("❌ Access token verification failed:");
      console.log(
        `   Error: ${providerMessage(caughtDetails0.response?.data) || caughtDetails0.message}\n`,
      );
      return;
    }

    // Test 2: Verify page access and admin status
    console.log("🧪 Test 2: Verifying Page Access & Admin Status...");
    try {
      const pageUrl = `https://graph.facebook.com/v23.0/${pageId}?fields=id,name,access_token,perms&access_token=${accessToken}`;
      const pageResponse = await axios.get(pageUrl);

      console.log("✅ Page access verified");
      console.log(`   Page ID: ${pageResponse.data.id}`);
      console.log(`   Page Name: ${pageResponse.data.name}`);
      console.log(
        `   Has page access token: ${
          pageResponse.data.access_token ? "✅ Yes" : "❌ No"
        }`,
      );

      if (pageResponse.data.perms) {
        console.log(
          `   Page permissions: ${pageResponse.data.perms.join(", ")}`,
        );
      }

      // Check if we can get admin roles
      try {
        const rolesUrl = `https://graph.facebook.com/v23.0/${pageId}/roles?access_token=${accessToken}`;
        const rolesResponse = await axios.get(rolesUrl);
        const tokenDetails = await axios.get(
          `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${accessToken}`,
        );
        const userRole = rolesResponse.data.data.find(
          (role: { uid: string; role: string }) =>
            role.uid === tokenDetails.data.data.user_id,
        );

        if (userRole) {
          console.log(`   Your role on this page: ${userRole.role}`);
          if (userRole.role !== "Administrator" && userRole.role !== "Editor") {
            console.log(
              "⚠️  Warning: You need Administrator or Editor role to post to this page",
            );
          }
        } else {
          console.log("⚠️  Could not determine your role on this page");
        }
      } catch (rolesError) {
        const caughtDetails1 = failureInfo(rolesError);

        console.log(
          "⚠️  Could not check page roles (this is normal for some page types)",
        );
      }

      console.log("");
    } catch (error) {
      const caughtDetails2 = failureInfo(error);

      console.log("❌ Page access verification failed:");
      console.log(
        `   Error: ${providerMessage(caughtDetails2.response?.data) || caughtDetails2.message}`,
      );
      console.log("   This could mean:");
      console.log("   - The page ID is incorrect");
      console.log("   - You don't have access to this page");
      console.log("   - The access token doesn't have page permissions\n");
      return;
    }

    // Test 2.5: Test basic text posting
    console.log("🧪 Test 2.5: Testing Basic Text Posting...");
    try {
      const textPostUrl = `https://graph.facebook.com/v23.0/${pageId}/feed`;
      const textPostParams = {
        message: "🤖 TEST: Facebook API Diagnostic - Text Post Test",
        access_token: accessToken,
      };

      const textResponse = await axios.post(textPostUrl, textPostParams);
      const textPostId = textResponse.data.id;

      console.log("✅ Text posting successful!");
      console.log(`   Post ID: ${textPostId}`);

      // Clean up the test post
      console.log("🧹 Cleaning up test text post...");
      const deleteUrl = `https://graph.facebook.com/v23.0/${textPostId}?access_token=${accessToken}`;
      await axios.delete(deleteUrl);
      console.log("✅ Test text post deleted\n");
    } catch (error) {
      const caughtDetails3 = failureInfo(error);

      console.log("❌ Text posting test failed:");
      console.log(
        `   Error: ${providerMessage(caughtDetails3.response?.data) || caughtDetails3.message}\n`,
      );
    }

    // Test 3: Check posting permissions
    console.log("🧪 Test 3: Testing Video Posting Permissions...");
    try {
      const testVideoUrl =
        "https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4";
      const postUrl = `https://graph.facebook.com/v23.0/${pageId}/videos`;
      const postParams = {
        file_url: testVideoUrl,
        description:
          "🤖 TEST: Facebook API Diagnostic - This post will be deleted if successful",
        access_token: accessToken,
      };

      const postResponse = await axios.post(postUrl, postParams);
      const postId = postResponse.data.id;

      console.log("✅ Video posting successful!");
      console.log(`   Post ID: ${postId}`);

      // Clean up the test post
      console.log("🧹 Cleaning up test post...");
      const deleteUrl = `https://graph.facebook.com/v23.0/${postId}?access_token=${accessToken}`;
      await axios.delete(deleteUrl);
      console.log("✅ Test post deleted\n");

      console.log("🎉 SUCCESS: Facebook API setup is working correctly!");
      console.log("   You can now use the Facebook upload functionality.");
    } catch (error) {
      const caughtDetails4 = failureInfo(error);

      console.log("❌ Video posting test failed:");
      console.log(
        `   Error: ${providerMessage(caughtDetails4.response?.data) || caughtDetails4.message}`,
      );
      console.log("   Common solutions:");
      console.log(
        "   - Ensure your Facebook app has 'pages_manage_posts' permission",
      );
      console.log("   - Verify you're an admin/editor of the Facebook page");
      console.log(
        "   - Check that the page ID is correct (numeric ID, not page name)\n",
      );
    }
  } catch (error) {
    const caughtDetails5 = failureInfo(error);

    console.error("❌ Diagnostic failed:", caughtDetails5.message);
  }
}

// Run the diagnostic
if (isMain(module, __filename)) {
  diagnoseFacebookSetup();
}

export = { diagnoseFacebookSetup };
