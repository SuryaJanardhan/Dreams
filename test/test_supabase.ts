import { present } from "../src/compat/guards.js";
import { failureInfo } from "../src/compat/errors.js";
import { createClient } from "@supabase/supabase-js";
import fs = require("fs");
import path = require("path");
require("dotenv").config();

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "videos";

console.log("🛠️ Supabase Test Configuration:");
console.log(`- URL: ${SUPABASE_URL}`);
console.log(`- Bucket: ${SUPABASE_BUCKET}`);
console.log(`- Key present: ${!!SUPABASE_SERVICE_ROLE_KEY}`);

const supabase = createClient(
  present(SUPABASE_URL, "SUPABASE_URL"),
  present(SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
);

async function testSupabase() {
  try {
    // 1. Find a sample video file
    const files = fs.readdirSync(".");
    const videoFile =
      files.find((f) => f.startsWith("FINAL_REEL_") && f.endsWith(".mp4")) ||
      "merged_output.mp4";

    if (!fs.existsSync(videoFile)) {
      console.error(
        `❌ No video file found for testing (searched for FINAL_REEL_*.mp4 or merged_output.mp4)`,
      );
      return;
    }

    const testFilePath = path.resolve(videoFile);
    console.log(`\n📄 Using video file: ${videoFile}`);

    // 2. Upload
    const fileName = `test_video_upload_${Date.now()}.mp4`;
    console.log(`📤 Uploading as: ${fileName}...`);

    const fileBuffer = fs.readFileSync(testFilePath);
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(fileName, fileBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (error) {
      console.error("❌ Upload Failed!");
      console.error(JSON.stringify(error, null, 2));
      return;
    }

    console.log("✅ Upload Successful!");
    console.log("Data:", JSON.stringify(data, null, 2));

    // 3. Get Public URL
    console.log("\n🔗 Generating Public URL...");
    const { data: urlData } = supabase.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(fileName);

    console.log(`Public Link: ${urlData.publicUrl}`);

    // 4. Verify Object Access (List bucket)
    console.log("\n🔎 Verifying object exists in bucket list...");
    const { data: listData, error: listError } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .list();

    if (listError) {
      console.error("❌ Failed to list bucket contents.");
      console.error(listError);
    } else {
      const found = listData.find((item) => item.name === fileName);
      console.log(
        found
          ? `✅ File confirmed present in bucket.`
          : `❌ File NOT found in bucket list!`,
      );
    }

    // // 5. Delete
    // console.log(`\n🗑️ Deleting test file: ${fileName}...`);
    // const { error: deleteError } = await supabase.storage
    //     .from(SUPABASE_BUCKET)
    //     .remove([fileName]);

    // if (deleteError) {
    //     console.error("❌ Delete Failed!");
    //     console.error(JSON.stringify(deleteError, null, 2));
    // } else {
    //     console.log("✅ Cleanup successful.");
    // }
  } catch (err) {
    const caughtDetails0 = failureInfo(err);

    console.error("\n🛑 Unexpected Script Error:");
    console.error(err);
  }
}

testSupabase();
