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
import type { StructuredGenerator } from "../ai/index.js";
import type { Config } from "../operations/config.js";
import { command } from "../operations/media.js";

const reviewSchema = z.object({
  technicalMeaning: z.number().int().min(0).max(100),
  sequenceClarity: z.number().int().min(0).max(100),
  visualRelevance: z.number().int().min(0).max(100),
  cleanliness: z.number().int().min(0).max(100),
  consistency: z.number().int().min(0).max(100),
  continuity: z.number().int().min(0).max(100),
  illustrationQuality: z.number().int().min(0).max(100),
  motionCoherence: z.number().int().min(0).max(100),
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
export type VisualQualityIssue = z.infer<typeof reviewSchema>["issues"][number];

export class VisualQualityError extends Error {
  constructor(
    readonly issues: VisualQualityIssue[],
    readonly scores: number[],
  ) {
    super(
      `Visual quality failed: scores ${scores.join(", ")}; ${issues
        .map(
          (issue) =>
            `${issue.beatId}${issue.objectId ? `/${issue.objectId}` : ""}: ${issue.defect}`,
        )
        .join("; ")}`,
    );
  }
}

export function requireVisualQuality(review: z.infer<typeof reviewSchema>) {
  const scores = [
    review.technicalMeaning,
    review.sequenceClarity,
    review.visualRelevance,
    review.cleanliness,
    review.consistency,
    review.continuity,
    review.illustrationQuality,
    review.motionCoherence,
    review.captionReadability,
  ];
  if (scores.some((score) => score < 80) || review.issues.length)
    throw new VisualQualityError(review.issues, scores);
  return Math.round(
    scores.reduce((sum, score) => sum + score, 0) / scores.length,
  );
}

export function createVisualQuality(
  groq: StructuredGenerator,
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
    const review = await groq.vision(
      `Critique these eight ordered samples as a senior motion-design reviewer. Judge the sequence as one authored animated explanation, not as eight standalone posters. Narration and beats: ${JSON.stringify(content)}. VisualStory: ${JSON.stringify(plan)}. Return JSON {technicalMeaning,sequenceClarity,visualRelevance,cleanliness,consistency,continuity,illustrationQuality,motionCoherence,captionReadability,issues:[{beatId,objectId?,defect}]}.
Check whether the viewer can follow what changed and why; whether the eye has one clear focal point at a time; whether persistent objects keep their identity and spatial logic; whether entrances, transfers, internal actions and reflows feel motivated, paced and settled; and whether the composition feels balanced, polished and comfortably readable on a phone. Penalize boxy dashboard layouts, clutter, repeated static arrangements, unexplained jumps, arbitrary motion, caption collisions and weak visual hierarchy. Do not demand decoration or motion where a quiet hold communicates better. Preserve the restrained palette and technical accuracy. Be strict, but report only specific defects that a VisualStory edit can fix.`,
      contactSheet,
      "image/jpeg",
      reviewSchema,
    );
    return requireVisualQuality(review);
  };
}
