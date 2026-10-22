import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import type {
  ContentPlan,
  RenderedVideo,
  VisualPlan,
  Workspace,
} from "../domain.js";
import type { Gemini } from "../content/index.js";
import type { Config } from "../operations/config.js";
import { command } from "../operations/media.js";

const reviewSchema = z.object({
  technicalMeaning: z.number().int().min(0).max(100),
  sequenceClarity: z.number().int().min(0).max(100),
  visualRelevance: z.number().int().min(0).max(100),
  cleanliness: z.number().int().min(0).max(100),
  consistency: z.number().int().min(0).max(100),
  captionReadability: z.number().int().min(0).max(100),
  issues: z
    .array(
      z.object({
        beatId: z.string().max(60),
        objectId: z.string().max(60).optional(),
        defect: z.string().min(3).max(240),
      }),
    )
    .max(8),
});

export function requireVisualQuality(review: z.infer<typeof reviewSchema>) {
  const scores = [
    review.technicalMeaning,
    review.sequenceClarity,
    review.visualRelevance,
    review.cleanliness,
    review.consistency,
    review.captionReadability,
  ];
  if (scores.some((score) => score < 80) || review.issues.length)
    throw new Error(
      `Visual quality failed: scores ${scores.join(", ")}; ${review.issues
        .map(
          (issue) =>
            `${issue.beatId}${issue.objectId ? `/${issue.objectId}` : ""}: ${issue.defect}`,
        )
        .join("; ")}`,
    );
  return Math.round(
    scores.reduce((sum, score) => sum + score, 0) / scores.length,
  );
}

export function createVisualQuality(
  config: Config,
  gemini: Gemini,
  signal: () => AbortSignal,
) {
  return async (
    content: ContentPlan,
    plan: VisualPlan,
    video: RenderedVideo,
    workspace: Workspace,
  ) => {
    const frames = resolve(workspace.path, "quality-frames");
    await mkdir(frames, { recursive: true });
    const interval = Math.max(1, video.duration / 8);
    await command(
      "ffmpeg",
      [
        "-y",
        "-i",
        video.path,
        "-vf",
        `fps=1/${interval},scale=270:480`,
        "-frames:v",
        "8",
        resolve(frames, "%02d.jpg"),
      ],
      signal(),
    );
    const inputs = await Promise.all(
      Array.from({ length: 8 }, (_item, index) =>
        sharp(resolve(frames, `${String(index + 1).padStart(2, "0")}.jpg`))
          .jpeg()
          .toBuffer(),
      ),
    );
    const contactSheet = workspace.file("quality-contact-sheet.jpg");
    await sharp({
      create: { width: 1080, height: 960, channels: 3, background: "white" },
    })
      .composite(
        inputs.map((input, index) => ({
          input,
          left: (index % 4) * 270,
          top: Math.floor(index / 4) * 480,
        })),
      )
      .jpeg({ quality: 88 })
      .toFile(contactSheet);
    const review = await gemini.vision(
      config.GEMINI_VISUAL_MODEL,
      config.GEMINI_API_KEY_FOR_VISUALS,
      `Audit these eight ordered sampled frames from one technical reel. Narration and beats: ${JSON.stringify(content)}. Declarative plan: ${JSON.stringify(plan)}. Return JSON {technicalMeaning,sequenceClarity,visualRelevance,cleanliness,consistency,captionReadability,issues:[{beatId,objectId?,defect}]}. Judge whether the images visibly explain the stated causal sequence, use the white/black/blue/green/yellow/red semantic system consistently, remain uncluttered, preserve object identity, and keep captions readable. Be strict and name only defects that require a visual-plan change.`,
      contactSheet,
      "image/jpeg",
      reviewSchema,
    );
    return requireVisualQuality(review);
  };
}
