import { isIP } from "node:net";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { z } from "zod";
import type {
  ContentPlan,
  Task,
  ValidatedAsset,
  VisualPlan,
  Workspace,
} from "../domain.js";
import type { Config } from "../operations/config.js";
import type { Http } from "../operations/http.js";
import type { Gemini } from "../content/index.js";

const candidatesSchema = z.object({
  candidates: z
    .array(
      z.object({
        pageUrl: z.url(),
        imageUrl: z.url().optional(),
        official: z.boolean(),
        rightsEvidence: z.string().min(5).max(300),
      }),
    )
    .max(6),
});
const reviewSchema = z.object({
  correctSubject: z.boolean(),
  requiredFeaturesPresent: z.boolean(),
  safeCrop: z.boolean(),
  relevance: z.number().int().min(0).max(100),
  issues: z.array(z.string().max(160)).max(5),
});

function safeRemoteUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("Asset URLs must use HTTPS");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    isIP(host) !== 0
  )
    throw new Error("Asset URL cannot target a local or numeric host");
  return url;
}

function metaImage(html: string, page: URL) {
  for (const expression of [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ]) {
    const match = expression.exec(html)?.[1];
    if (match) return new URL(match.replace(/&amp;/g, "&"), page).href;
  }
  return undefined;
}

async function resolveImage(http: Http, pageRaw: string, explicit?: string) {
  if (explicit) return safeRemoteUrl(explicit);
  const page = safeRemoteUrl(pageRaw);
  const response = await http.response(page.href, {
    headers: { Accept: "text/html,image/*" },
    timeout: 30000,
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.startsWith("image/")) return page;
  if (!contentType.includes("text/html"))
    throw new Error("Source page is neither HTML nor an image");
  const html = (await response.text()).slice(0, 2_000_000);
  const image = metaImage(html, page);
  if (!image) throw new Error("Source page has no declared preview image");
  return safeRemoteUrl(image);
}

export function createAssets(config: Config, http: Http, gemini: Gemini) {
  return async (
    task: Task,
    content: ContentPlan,
    plan: VisualPlan,
    workspace: Workspace,
  ): Promise<ValidatedAsset[]> => {
    const assets: ValidatedAsset[] = [];
    for (const intent of plan.assetIntents) {
      let lastError = "No candidate found";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const search = await gemini.grounded(
            config.GEMINI_VISUAL_MODEL,
            config.GEMINI_API_KEY_FOR_VISUALS,
            `Find an image source for this technical explanation. Topic: ${JSON.stringify(task.idea)}. Asset intent: ${JSON.stringify(intent)}. Explanation: ${JSON.stringify(content.narration)}. User-provided sources: ${JSON.stringify(task.sourceUrls)}. Prefer an official documentation, product, standards, or repository page. A third-party page is allowed only when it explicitly states reusable licensing. Return JSON {candidates:[{pageUrl,imageUrl?,official,rightsEvidence}]}. Do not return social media, stock preview, tracking, data, blob, or search-result URLs.`,
            candidatesSchema,
          );
          const grounded = new Set(search.sources.map((source) => source.url));
          const provided = new Set(task.sourceUrls);
          const candidate = search.value.candidates.find(
            (item) => grounded.has(item.pageUrl) || provided.has(item.pageUrl),
          );
          if (!candidate)
            throw new Error("No traceable image candidate returned");
          if (
            !candidate.official &&
            !/creative commons|public domain|cc[- ]by|reusable|licensed/i.test(
              candidate.rightsEvidence,
            )
          )
            throw new Error(
              "Third-party candidate has no explicit reuse evidence",
            );
          const imageUrl = await resolveImage(
            http,
            candidate.pageUrl,
            candidate.imageUrl,
          );
          const response = await http.response(imageUrl.href, {
            headers: { Accept: "image/png,image/jpeg,image/webp" },
            timeout: 60000,
          });
          const imageType = (response.headers.get("content-type") ?? "")
            .split(";")[0]
            ?.trim();
          if (
            !imageType ||
            !["image/png", "image/jpeg", "image/webp"].includes(imageType)
          )
            throw new Error(
              `Unsupported image content type: ${imageType || "missing"}`,
            );
          const contentLength = Number(
            response.headers.get("content-length") ?? 0,
          );
          if (contentLength > 8_000_000)
            throw new Error("Image exceeds 8 MB limit");
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length > 8_000_000)
            throw new Error("Image exceeds 8 MB limit");
          const decoded = sharp(bytes, { failOn: "error" });
          const metadata = await decoded.metadata();
          if (
            !metadata.width ||
            !metadata.height ||
            metadata.width < 600 ||
            metadata.height < 400
          )
            throw new Error("Image resolution is below 600×400");
          const path = workspace.file(`asset-${intent.id}.png`);
          await writeFile(
            path,
            await decoded
              .resize(1200, 900, { fit: "inside", withoutEnlargement: true })
              .png()
              .toBuffer(),
          );
          const review = await gemini.vision(
            config.GEMINI_VISUAL_MODEL,
            config.GEMINI_API_KEY_FOR_VISUALS,
            `Judge this image only for the stated use in a technical reel. Intent: ${JSON.stringify(intent)}. Return JSON {correctSubject,requiredFeaturesPresent,safeCrop,relevance,issues}. Reject generic, misleading, text-heavy, blurry, badly cropped, watermarked, or semantically unrelated images.`,
            path,
            "image/png",
            reviewSchema,
          );
          if (
            !review.correctSubject ||
            !review.requiredFeaturesPresent ||
            !review.safeCrop ||
            review.relevance < 85
          )
            throw new Error(
              `Image relevance review failed: ${review.issues.join("; ")}`,
            );
          assets.push({
            id: intent.id,
            path,
            sourcePage: candidate.pageUrl,
            sourceUrl: imageUrl.href,
            width: metadata.width,
            height: metadata.height,
          });
          lastError = "";
          break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
      if (lastError)
        throw new Error(
          `Asset ${intent.id} failed after one replacement: ${lastError}`,
        );
    }
    return assets;
  };
}
