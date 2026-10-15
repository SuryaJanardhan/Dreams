// Preview of what the social media content would look like
const previewSocialMediaContent = () => {
  console.log("🎯 SOCIAL MEDIA CONTENT PREVIEW");
  console.log("================================\n");

  // Example content that would be generated
  const exampleTitle = "Understanding Machine Learning Algorithms";
  const exampleDescription =
    "A comprehensive guide to ML algorithms and their applications";

  console.log("📝 EXAMPLE TITLE:", exampleTitle);
  console.log("📝 EXAMPLE DESCRIPTION:", exampleDescription);
  console.log("\n");

  // Simulate the LLM explanation (70 words) - without title repetition or "understanding"
  const topicExplanation =
    "This is a fascinating topic that explores the fundamental concepts and practical applications in this field. This educational video breaks down complex ideas into simple explanations, covering key principles, real-world examples, and important insights. Whether you're a student, professional, or simply curious about the subject, you'll discover valuable knowledge that can be applied in various contexts. Join us as we explore the essential aspects and emerging trends that make this topic both relevant and exciting in today's world.";

  console.log("🤖 LLM-GENERATED EXPLANATION (~70 words):");
  console.log(topicExplanation);
  console.log("\n");

  // Get topic-related emoji (simplified)
  const topicEmoji = "🧠";

  // Generate platform-specific hashtags (exactly 10 each)
  const text = `${exampleTitle} ${exampleDescription}`.toLowerCase();

  // YouTube hashtags (educational focus)
  const youtubeHashtags = [
    "#education",
    "#learning",
    "#knowledge",
    "#educational",
    "#tutorial",
    "#howto",
    "#explained",
    "#guide",
    "#tips",
    "#facts",
  ];

  // Instagram hashtags (visual/social focus)
  const instagramHashtags = [
    "#instagram",
    "#instadaily",
    "#instavideo",
    "#reels",
    "#reel",
    "#viral",
    "#trending",
    "#fyp",
    "#explore",
    "#discover",
  ];

  // Facebook hashtags (community focus)
  const facebookHashtags = [
    "#facebook",
    "#community",
    "#share",
    "#learn",
    "#education",
    "#knowledge",
    "#tips",
    "#facts",
    "#viral",
    "#trending",
  ];

  // Add topic-specific hashtags
  if (text.includes("science")) {
    youtubeHashtags.push("#science", "#scientific");
    instagramHashtags.push("#science", "#stem");
    facebookHashtags.push("#science", "#research");
  }
  if (text.includes("tech")) {
    youtubeHashtags.push("#technology", "#tech");
    instagramHashtags.push("#tech", "#innovation");
    facebookHashtags.push("#technology", "#digital");
  }
  if (text.includes("ai")) {
    youtubeHashtags.push("#ai", "#artificialintelligence");
    instagramHashtags.push("#ai", "#machinelearning");
    facebookHashtags.push("#ai", "#future");
  }
  if (text.includes("data")) {
    youtubeHashtags.push("#datascience", "#analytics");
    instagramHashtags.push("#data", "#insights");
    facebookHashtags.push("#data", "#analytics");
  }

  const youtubeHashtagString = youtubeHashtags.slice(0, 10).join(" ");
  const instagramHashtagString = instagramHashtags.slice(0, 10).join(" ");
  const facebookHashtagString = facebookHashtags.slice(0, 10).join(" ");

  // YouTube Content
  console.log("📺 YOUTUBE CONTENT:");
  console.log("----------------");
  console.log(`Title: ${exampleTitle}`);
  console.log("\nDescription:");
  console.log(
    `${topicEmoji} ${exampleTitle}\n\n${topicExplanation}\n\n🔥 Don't forget to:\n👍 Like this video if you learned something new!\n🔔 Subscribe for more educational content like this!\n💬 Share your thoughts in the comments below!\n🔗 Save this video to watch again later!\n\n${youtubeHashtagString}`,
  );
  console.log("\n");

  // Instagram Content
  console.log("📱 INSTAGRAM CONTENT:");
  console.log("-------------------");
  console.log("Caption:");
  console.log(
    `${topicEmoji} ${exampleTitle}\n\n${topicExplanation}\n\n❤️ Like & Follow for more educational content!\n🔄 Share this with friends who need to learn this!\n💬 Drop your questions in the comments below!\n📚 Save this post for future reference!\n\n${instagramHashtagString}`,
  );
  console.log("\n");

  // Facebook Content
  console.log("📘 FACEBOOK CONTENT:");
  console.log("------------------");
  console.log("Caption:");
  console.log(
    `${topicEmoji} ${exampleTitle}\n\n${topicExplanation}\n\n👍 Like this post if you found it helpful!\n🔄 Share this with your friends and family!\n💬 What are your thoughts? Comment below!\n👥 Tag someone who would benefit from this knowledge!\n\n${facebookHashtagString}`,
  );
  console.log("\n");

  console.log("🎯 KEY FEATURES:");
  console.log("---------------");
  console.log("✅ YouTube: 70-word LLM explanation + educational CTAs");
  console.log("✅ Instagram: Title + explanation + social engagement CTAs");
  console.log("✅ Facebook: Title + explanation + community sharing CTAs");
  console.log("✅ Each platform: Exactly 10 unique hashtags");
  console.log("✅ Platform-specific calls-to-action optimized for engagement");
};

previewSocialMediaContent();
