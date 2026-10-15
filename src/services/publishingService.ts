import { truthy } from "../compat/guards.js";
import type {
  LegacyStaging,
  LegacyPublishResult,
} from "../compat/contracts.js";
import { failureInfo } from "../compat/errors.js";
import logger = require("../config/logger.js");
import legacyModule0 = require("./socialMediaService.js");
const {
  generateUnifiedSocialMediaCaption,
  uploadToFacebookWithUrl,
  uploadToInstagramWithUrl,
  uploadToSupabaseAndGetLink,
  uploadToYouTube,
} = legacyModule0;

async function generatePublishingCaption({ topic }: { topic: string }) {
  return generateUnifiedSocialMediaCaption(topic);
}

async function publishReel({
  videoPath,
  topic,
  caption,
}: {
  videoPath: string;
  topic: string;
  caption: string;
}) {
  const links = { yt: "", insta: "", fb: "" };
  const errors = [];
  let staging: LegacyStaging | null = null;

  try {
    logger.info("☁️ Uploading to Supabase (Staging for Meta)...");
    staging = await uploadToSupabaseAndGetLink(videoPath, topic);
  } catch (e) {
    const caughtDetails1 = failureInfo(e);

    errors.push({ platform: "supabase", message: caughtDetails1.message });
    logger.error(`❌ Supabase Upload Error: ${caughtDetails1.message}`);
  }

  const ytPromise = uploadToYouTube(videoPath, topic, caption)
    .then((res) => {
      if (res.success) {
        links.yt = res.url;
        logger.info(`✅ YT Posted: ${res.url}`);
      }
    })
    .catch((e: unknown) => {
      const caughtDetails2 = failureInfo(e);

      errors.push({ platform: "youtube", message: caughtDetails2.message });
      logger.error(`❌ YT Error: ${caughtDetails2.message}`);
    });

  const metaPromises = [];

  if (staging && staging.success) {
    const publicUrl = staging.publicLink;
    if (!publicUrl)
      throw new Error("Successful staging result omitted publicLink");
    logger.info(`✅ Supabase Link (Staging for Meta): ${publicUrl}`);

    metaPromises.push(
      uploadToInstagramWithUrl(publicUrl, topic, caption)
        .then((res) => {
          if (res.success) {
            links.insta = res.url;
            logger.info(`✅ Insta Posted: ${res.url}`);
          }
        })
        .catch((e: unknown) => {
          const caughtDetails3 = failureInfo(e);

          errors.push({
            platform: "instagram",
            message: caughtDetails3.message,
          });
          logger.error(`❌ Insta Error: ${caughtDetails3.message}`);
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
        .catch((e: unknown) => {
          const caughtDetails4 = failureInfo(e);

          errors.push({
            platform: "facebook",
            message: caughtDetails4.message,
          });
          logger.error(`❌ FB Error: ${caughtDetails4.message}`);
        }),
    );
  } else {
    logger.warn(
      "⚠️ Meta (Instagram/Facebook) upload skipped because Supabase staging failed.",
    );
  }

  await Promise.allSettled([ytPromise, ...metaPromises]);

  const successCount = [links.yt, links.insta, links.fb].filter(truthy).length;

  return {
    success: successCount > 0,
    successCount,
    links,
    staging,
    errors,
  };
}

async function cleanupPublishingStaging(
  publishResult: { staging?: LegacyStaging | null } | null,
) {
  if (publishResult?.staging?.success && publishResult.staging.fileName) {
    logger.info("🧹 Cleaning up Supabase temporary storage...");
    // Existing workflow intentionally leaves deletion disabled while Meta upload polling is sensitive.
  }
}

export = {
  cleanupPublishingStaging,
  generatePublishingCaption,
  publishReel,
};
