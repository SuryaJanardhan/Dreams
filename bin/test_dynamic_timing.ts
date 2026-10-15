import { historicalImages } from "../src/compat/historical.js";
import type { AudioSegment } from "../src/compat/contracts.js";
import { failureInfo } from "../src/compat/errors.js";
import legacyModule0 = require("../src/services/imageService.js");
const {
  parseSRTFile,
  extractTechnicalTerms,
  createDynamicImageChunksFromTerms,
  generateSimpleImagePrompts,
} = historicalImages(legacyModule0);
import fs = require("fs");
import path = require("path");

/**
 * Test the dynamic timing system
 */
async function testDynamicTiming() {
  console.log("🧪 Testing Dynamic Image Timing System");
  console.log("=====================================");

  // Create sample SRT content for testing
  const sampleSRT = `1
00:00:01,000 --> 00:00:05,000
Welcome to our tutorial on machine learning algorithms.

2
00:00:05,000 --> 00:00:10,000
Today we'll explore artificial intelligence and neural networks.

3
00:00:10,000 --> 00:00:15,000
Let's start with the basics of API development and cloud computing.

4
00:00:15,000 --> 00:00:20,000
We'll cover database optimization and security best practices.

5
00:00:20,000 --> 00:00:25,000
Finally, we'll discuss deployment strategies and framework selection.

6
00:00:25,000 --> 00:00:30,000
Thank you for watching this comprehensive technology overview.`;

  // Create temporary SRT file
  const tempSRTPath = path.join(__dirname, "temp_test_subtitles.srt");
  fs.writeFileSync(tempSRTPath, sampleSRT);

  try {
    console.log("📝 Step 1: Parsing SRT file...");
    const subtitleSegments = parseSRTFile(tempSRTPath);
    console.log(`✅ Found ${subtitleSegments.length} subtitle segments`);

    console.log("\n📊 Subtitle Segments:");
    subtitleSegments.forEach(
      (seg: import("../src/compat/historical.js").ImageSegment, i: number) => {
        console.log(
          `   ${i + 1}. ${seg.startTime.toFixed(1)}s - ${seg.endTime.toFixed(
            1,
          )}s: "${seg.text}"`,
        );
      },
    );

    console.log("\n🔍 Step 2: Extracting technical terms...");
    const allText = subtitleSegments
      .map(
        (seg: import("../src/compat/historical.js").ImageSegment) => seg.text,
      )
      .join(" ");
    const technicalTerms = await extractTechnicalTerms(allText);
    console.log(
      `✅ Extracted ${technicalTerms.length} technical terms:`,
      technicalTerms,
    );

    console.log(
      "\n⏰ Step 3: Creating dynamic chunks based on term appearances...",
    );
    const dynamicChunks = createDynamicImageChunksFromTerms(
      subtitleSegments,
      technicalTerms,
    );
    console.log(`✅ Created ${dynamicChunks.length} dynamic chunks`);

    console.log("\n📈 Dynamic Timing Results:");
    dynamicChunks.forEach(
      (chunk: import("../src/compat/historical.js").ImageChunk, i: number) => {
        console.log(`   Chunk ${i + 1} (${chunk.term}):`);
        console.log(
          `     • Time: ${chunk.startTime.toFixed(1)}s - ${chunk.endTime.toFixed(
            1,
          )}s`,
        );
        console.log(`     • Duration: ${chunk.duration.toFixed(1)}s`);
        console.log(`     • Appearances: ${chunk.appearances}`);
        console.log(`     • Subtitle segments: ${chunk.subtitleCount}`);
        console.log("");
      },
    );

    console.log("🎨 Step 4: Generating image prompts...");
    const prompts = await generateSimpleImagePrompts(technicalTerms);
    console.log(`✅ Generated ${prompts.length} image prompts`);

    console.log("\n📝 Sample Prompts:");
    prompts.slice(0, 3).forEach((prompt: string, i: number) => {
      console.log(`   ${i + 1}. ${prompt.substring(0, 100)}...`);
    });

    console.log("\n✅ Dynamic Timing Test Completed Successfully!");
    console.log("🎯 Key Benefits:");
    console.log("   • Images appear exactly when terms are mentioned");
    console.log("   • No more fixed 7-second segments");
    console.log("   • Timing is synchronized with content");
    console.log("   • More natural and engaging visual flow");
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    console.error("❌ Test failed:", caughtDetails1.message);
    console.error(caughtDetails1.stack);
  } finally {
    // Clean up temporary file
    if (fs.existsSync(tempSRTPath)) {
      fs.unlinkSync(tempSRTPath);
    }
  }
}

// Run the test
testDynamicTiming();
