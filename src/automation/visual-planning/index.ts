import { z } from "zod";
import type {
  ContentPlan,
  PrimitiveKind,
  PrimitiveSpec,
  SemanticColor,
  Task,
  VisualPlan,
} from "../domain.js";
import type { Config } from "../operations/config.js";
import { twice } from "../operations/http.js";
import type { Gemini } from "../content/index.js";

const semanticColors = [
  "structure",
  "active",
  "success",
  "warning",
  "failure",
] as const satisfies readonly SemanticColor[];
const primitiveKinds = [
  "label",
  "code-card",
  "table",
  "database",
  "file",
  "queue",
  "service",
  "client",
  "browser",
  "api",
  "lock",
  "badge",
  "counter",
  "image",
  "composite",
] as const satisfies readonly PrimitiveKind[];
const operations = [
  "create",
  "reveal",
  "draw",
  "transfer",
  "mutate",
  "compare",
  "annotate",
  "focus",
  "dim",
  "remove",
  "settle",
] as const;
const boxSchema = z
  .object({
    x: z.number().int().min(0).max(820),
    y: z.number().int().min(0).max(1170),
    width: z.number().int().min(80).max(760),
    height: z.number().int().min(60).max(560),
  })
  .refine((box) => box.x + box.width <= 900, "Object exceeds scene width")
  .refine(
    (box) => box.y + box.height <= 1250,
    "Object exceeds diagram safe area",
  );
const primitiveSpecSchema: z.ZodType<PrimitiveSpec> = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{2,50}$/),
    label: z.string().min(1).max(80),
    shapes: z
      .array(
        z
          .object({
            kind: z.enum(["rect", "circle", "line", "path", "text"]),
            x: z.number().min(0).max(100),
            y: z.number().min(0).max(100),
            width: z.number().min(0).max(100).optional(),
            height: z.number().min(0).max(100).optional(),
            text: z.string().max(40).optional(),
            semantic: z.enum(semanticColors),
          })
          .strict(),
      )
      .min(1)
      .max(24),
  })
  .strict();
export function parsePrimitiveSpec(value: unknown) {
  return validatePrimitiveSpec(primitiveSpecSchema.parse(value));
}
function validatePrimitiveSpec(spec: PrimitiveSpec) {
  for (const [index, shape] of spec.shapes.entries()) {
    if (
      shape.x + (shape.width ?? 0) > 100 ||
      shape.y + (shape.height ?? 0) > 100
    )
      throw new Error(
        `Primitive ${spec.id} shape ${index} exceeds its view box`,
      );
  }
  return spec;
}
export const visualPlanSchema: z.ZodType<VisualPlan> = z
  .object({
    version: z.literal(1),
    objects: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9-]{1,50}$/),
            kind: z.enum(primitiveKinds),
            label: z.string().min(1).max(60),
            semantic: z.enum(semanticColors),
            box: boxSchema,
            detail: z.string().max(240).optional(),
            rows: z
              .array(z.array(z.string().min(1).max(30)).min(1).max(5))
              .max(5)
              .optional(),
            assetId: z
              .string()
              .regex(/^[a-z][a-z0-9-]{1,50}$/)
              .optional(),
            primitiveId: z
              .string()
              .regex(/^[a-z][a-z0-9-]{2,50}$/)
              .optional(),
          })
          .strict(),
      )
      .min(2)
      .max(18),
    beats: z
      .array(
        z
          .object({
            beatId: z.string().regex(/^[a-zA-Z0-9-]+$/),
            objectIds: z.array(z.string()).min(1).max(7),
            transitions: z
              .array(
                z
                  .object({
                    operation: z.enum(operations),
                    objectIds: z.array(z.string()).min(1).max(4),
                    anchor: z.string().min(1).max(60),
                    value: z.string().max(120).optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(12),
          })
          .strict(),
      )
      .min(3)
      .max(8),
    assetIntents: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9-]{1,50}$/),
            query: z.string().min(3).max(180),
            purpose: z.string().min(5).max(240),
            requiredFeatures: z.array(z.string().min(2).max(100)).min(1).max(6),
            sourcePreference: z.literal("official-first"),
          })
          .strict(),
      )
      .max(2),
    proposedPrimitives: z.array(primitiveSpecSchema).max(2),
  })
  .strict();

function overlapRatio(
  first: VisualPlan["objects"][number]["box"],
  second: VisualPlan["objects"][number]["box"],
) {
  const width = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) -
      Math.max(first.x, second.x),
  );
  const height = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) -
      Math.max(first.y, second.y),
  );
  const intersection = width * height;
  return (
    intersection /
    Math.min(first.width * first.height, second.width * second.height)
  );
}

export function validateVisualPlan(plan: VisualPlan, content: ContentPlan) {
  const errors: string[] = [];
  for (const primitive of plan.proposedPrimitives)
    try {
      validatePrimitiveSpec(primitive);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  const objects = new Map(plan.objects.map((object) => [object.id, object]));
  if (objects.size !== plan.objects.length)
    errors.push("Object IDs must be unique");
  const expectedBeats = content.beats.map((beat) => beat.id);
  if (
    expectedBeats.length !== plan.beats.length ||
    expectedBeats.some((id, index) => plan.beats[index]?.beatId !== id)
  )
    errors.push("Visual beats must match content beats in order");
  const intents = new Set(plan.assetIntents.map((intent) => intent.id));
  const primitives = new Set(plan.proposedPrimitives.map((item) => item.id));
  for (const object of plan.objects) {
    if (
      object.kind === "image" &&
      (!object.assetId || !intents.has(object.assetId))
    )
      errors.push(`Image ${object.id} has no matching asset intent`);
    if (
      object.kind === "composite" &&
      (!object.primitiveId || !primitives.has(object.primitiveId))
    )
      errors.push(`Composite ${object.id} has no proposed primitive`);
  }
  for (const beat of plan.beats) {
    const story = content.beats.find((item) => item.id === beat.beatId);
    if (!story) continue;
    for (const id of beat.objectIds)
      if (!objects.has(id))
        errors.push(`Beat ${beat.beatId} references unknown ${id}`);
    for (const transition of beat.transitions) {
      for (const id of transition.objectIds)
        if (!beat.objectIds.includes(id))
          errors.push(`Transition references inactive object ${id}`);
      if (!story.text.toLowerCase().includes(transition.anchor.toLowerCase()))
        errors.push(
          `Anchor ${JSON.stringify(transition.anchor)} is absent from beat ${beat.beatId}`,
        );
    }
    const active = beat.objectIds.flatMap((id) => {
      const object = objects.get(id);
      return object ? [object] : [];
    });
    for (let first = 0; first < active.length; first++)
      for (let second = first + 1; second < active.length; second++) {
        const a = active[first];
        const b = active[second];
        if (a && b && overlapRatio(a.box, b.box) > 0.12)
          errors.push(
            `Objects ${a.id} and ${b.id} overlap in beat ${beat.beatId}`,
          );
      }
  }
  if (errors.length) throw new Error(errors.slice(0, 8).join("; "));
  return plan;
}

export function createVisualPlan(config: Config, gemini: Gemini) {
  return (
    task: Task,
    content: ContentPlan,
    promotedPrimitives: PrimitiveSpec[] = [],
  ) =>
    twice(async (_attempt, error) => {
      const result = await gemini.generate(
        config.GEMINI_VISUAL_MODEL,
        config.GEMINI_API_KEY_FOR_VISUALS,
        `Create a declarative visual plan for this vertical technical reel. Topic: ${JSON.stringify(task.idea)}. Content: ${JSON.stringify(content)}. Trusted reusable composite primitives: ${JSON.stringify(promotedPrimitives)}.
Output JSON matching {version:1,objects:[{id,kind,label,semantic,box:{x,y,width,height},detail?,rows?,assetId?,primitiveId?}],beats:[{beatId,objectIds,transitions:[{operation,objectIds,anchor,value?}]}],assetIntents:[{id,query,purpose,requiredFeatures,sourcePreference:"official-first"}],proposedPrimitives:[{id,label,shapes:[{kind,x,y,width?,height?,text?,semantic}]}]}.
Canvas coordinates are 900×1250. Use 2–7 active objects per beat with no overlaps. Object positions stay fixed across beats. Use only kinds ${primitiveKinds.join(", ")} and semantic colors ${semanticColors.join(", ")}. White is the canvas; structure is black, active blue, success green, warning yellow, failure red. Prefer built-in diagrams. Use image only for a real interface or product that materially aids the explanation, with a matching asset intent. Use composite only when no built-in kind can express the concept. Reuse a trusted primitive when suitable and copy its exact spec into proposedPrimitives; otherwise create a matching declarative primitive from normalized 0–100 shapes. Never request a human, avatar, decorative background, logo, watermark, arbitrary color, generated executable code, or more than two assets/primitives.
Every content beat appears once in order. Every transition anchor must be an exact phrase from that beat's narration. Animate only causal actions using purposeful create, reveal, draw, transfer, mutate, compare, annotate, focus, dim, remove, or settle operations. ${error ? `Repair these validation errors: ${error}` : ""}`,
        visualPlanSchema,
      );
      return validateVisualPlan(result, content);
    });
}

export async function repairVisualPlan(
  config: Config,
  gemini: Gemini,
  content: ContentPlan,
  rejected: VisualPlan,
  feedback: string,
) {
  const repaired = await gemini.generate(
    config.GEMINI_VISUAL_MODEL,
    config.GEMINI_API_KEY_FOR_VISUALS,
    `Repair this declarative visual plan after automated frame review. Content: ${JSON.stringify(content)}. Rejected plan: ${JSON.stringify(rejected)}. Review defects: ${JSON.stringify(feedback)}. Return the complete corrected VisualPlan JSON. Preserve valid objects and beat IDs. Change only the objects, layout, transitions, labels, or semantic states required to fix the reported defects. Do not add executable code, humans, decorative backgrounds, logos, watermarks, or arbitrary colors.`,
    visualPlanSchema,
  );
  const beforeAssets = JSON.stringify(rejected.assetIntents);
  const afterAssets = JSON.stringify(repaired.assetIntents);
  const beforePrimitives = JSON.stringify(rejected.proposedPrimitives);
  const afterPrimitives = JSON.stringify(repaired.proposedPrimitives);
  if (beforeAssets !== afterAssets || beforePrimitives !== afterPrimitives)
    throw new Error(
      "Visual quality repair cannot change validated assets or primitive specifications",
    );
  return validateVisualPlan(repaired, content);
}
