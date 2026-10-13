const logger = require("../config/logger");
const {
  generateUnifiedSocialMediaCaption,
  uploadToFacebookWithUrl,
  uploadToInstagramWithUrl,
  uploadToSupabaseAndGetLink,
  uploadToYouTube,
} = require("./socialMediaService");

async function generatePublishingCaption({ topic }) {
  return generateUnifiedSocialMediaCaption(topic);
}

async function publishReel({ videoPath, topic, caption }) {
  const links = { yt: "", insta: "", fb: "" };
  const errors = [];
  let staging = null;

  try {
    logger.info("☁️ Uploading to Supabase (Staging for Meta)...");
    staging = await uploadToSupabaseAndGetLink(videoPath, topic);
  } catch (e) {
    errors.push({ platform: "supabase", message: e.message });
    logger.error(`❌ Supabase Upload Error: ${e.message}`);
  }

  const ytPromise = uploadToYouTube(videoPath, topic, caption)
    .then((res) => {
      if (res.success) {
        links.yt = res.url;
        logger.info(`✅ YT Posted: ${res.url}`);
      }
    })
    .catch((e) => {
      errors.push({ platform: "youtube", message: e.message });
      logger.error(`❌ YT Error: ${e.message}`);
    });

  const metaPromises = [];

  if (staging && staging.success) {
    const publicUrl = staging.publicLink;
    logger.info(`✅ Supabase Link (Staging for Meta): ${publicUrl}`);

    metaPromises.push(
      uploadToInstagramWithUrl(publicUrl, topic, caption)
        .then((res) => {
          if (res.success) {
            links.insta = res.url;
            logger.info(`✅ Insta Posted: ${res.url}`);
          }
        })
        .catch((e) => {
          errors.push({ platform: "instagram", message: e.message });
          logger.error(`❌ Insta Error: ${e.message}`);
        }),
    );

    metaPromises.push(
      uploadToFacebookWithUrl(publicUrl, topic, caption)
        .then((res) => {
          if (res.success) {
            links.fb = res.url;
            logger.info(`✅ FB Posted: ${res.url}`);
          }
        })
        .catch((e) => {
          errors.push({ platform: "facebook", message: e.message });
          logger.error(`❌ FB Error: ${e.message}`);
        }),
    );
  } else {
    logger.warn(
      "⚠️ Meta (Instagram/Facebook) upload skipped because Supabase staging failed.",
    );
  }

  await Promise.allSettled([ytPromise, ...metaPromises]);

  const successCount = [links.yt, links.insta, links.fb].filter(Boolean).length;

  return {
    success: successCount > 0,
    successCount,
    links,
    staging,
    errors,
  };
}

async function cleanupPublishingStaging(publishResult) {
  if (publishResult?.staging?.success && publishResult.staging.fileName) {
    logger.info("🧹 Cleaning up Supabase temporary storage...");
    // Existing workflow intentionally leaves deletion disabled while Meta upload polling is sensitive.
  }
}

module.exports = {
  cleanupPublishingStaging,
  generatePublishingCaption,
  publishReel,
};
