import { z } from "zod";
import type {
  ContentPlan,
  MotionPreset,
  PrimitiveKind,
  PrimitiveSpec,
  SemanticColor,
  Task,
  VisualBox,
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
  "server",
  "server-cluster",
  "cache",
  "load-balancer",
  "cloud",
  "token",
  "repository",
  "pipeline",
  "container",
  "virtual-machine",
  "terminal",
  "phone",
  "decision",
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
  "reflow",
  "row-insert",
  "queue-advance",
  "lock",
  "unlock",
  "fail",
  "succeed",
  "highlight-code",
  "expire",
  "branch",
] as const;
const motionPresets = [
  "soft-enter",
  "draw-path",
  "travel-path",
  "state-change",
  "internal-action",
  "rearrange",
  "focus",
  "settle",
  "soft-exit",
] as const satisfies readonly MotionPreset[];
const cameraActions = [
  "frame",
  "pan",
  "push-in",
  "pull-out",
  "follow",
  "return-wide",
] as const;
const boxSchema: z.ZodType<VisualBox> = z
  .object({
    x: z.number().int().min(0).max(820),
    y: z.number().int().min(0).max(1170),
    width: z.number().int().min(80).max(760),
    height: z.number().int().min(60).max(560),
  })
  .strict()
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
            text: z.string().max(120).optional(),
            semantic: z.enum(semanticColors),
          })
          .strict(),
      )
      .min(1)
      .max(24),
  })
  .strict();

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
export function parsePrimitiveSpec(value: unknown) {
  return validatePrimitiveSpec(primitiveSpecSchema.parse(value));
}

export const visualPlanSchema: z.ZodType<VisualPlan> = z
  .object({
    version: z.literal(2),
    world: z
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
    timeline: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9-]{1,60}$/),
            beatId: z.string().regex(/^[a-zA-Z0-9-]+$/),
            action: z.enum(operations),
            objectIds: z.array(z.string()).min(1).max(7),
            anchor: z.string().min(1).max(60),
            value: z.string().max(120).optional(),
            motion: z.enum(motionPresets),
            layout: z
              .array(
                z
                  .object({
                    objectId: z.string(),
                    box: boxSchema,
                  })
                  .strict(),
              )
              .min(1)
              .max(7)
              .optional(),
          })
          .strict(),
      )
      .min(3)
      .max(48),
    camera: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9-]{1,60}$/),
            beatId: z.string().regex(/^[a-zA-Z0-9-]+$/),
            action: z.enum(cameraActions),
            objectIds: z.array(z.string()).min(1).max(7),
            anchor: z.string().min(1).max(60),
            zoom: z.number().min(1).max(1.15),
          })
          .strict(),
      )
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

function overlapRatio(first: VisualBox, second: VisualBox) {
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
  return (
    (width * height) /
    Math.min(first.width * first.height, second.width * second.height)
  );
}
function words(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
function anchorStart(text: string, anchor: string) {
  const source = words(text);
  const target = words(anchor);
  for (let index = 0; index <= source.length - target.length; index++)
    if (target.every((word, offset) => source[index + offset] === word))
      return index;
  return -1;
}

export function validateVisualPlan(plan: VisualPlan, content: ContentPlan) {
  const errors: string[] = [];
  for (const primitive of plan.proposedPrimitives)
    try {
      validatePrimitiveSpec(primitive);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  const objects = new Map(plan.world.map((object) => [object.id, object]));
  if (objects.size !== plan.world.length)
    errors.push("Object IDs must be unique");
  const actionIds = new Set(plan.timeline.map((action) => action.id));
  if (actionIds.size !== plan.timeline.length)
    errors.push("Timeline action IDs must be unique");
  const intents = new Set(plan.assetIntents.map((intent) => intent.id));
  const primitives = new Set(plan.proposedPrimitives.map((item) => item.id));
  for (const object of plan.world) {
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
  const beatOrder = new Map(
    content.beats.map((beat, index) => [beat.id, index] as const),
  );
  const seenBeats = new Set<string>();
  const firstAction = new Set<string>();
  const visible = new Set<string>();
  const boxes = new Map(plan.world.map((object) => [object.id, object.box]));
  let previousBeat = -1;
  const introducing = new Set(["create", "reveal", "draw"]);
  for (const action of plan.timeline) {
    const order = beatOrder.get(action.beatId);
    const beat = content.beats.find((item) => item.id === action.beatId);
    if (order === undefined || !beat) {
      errors.push(`Unknown content beat ${action.beatId}`);
      continue;
    }
    if (order < previousBeat)
      errors.push("Timeline actions must follow content beat order");
    previousBeat = Math.max(previousBeat, order);
    seenBeats.add(action.beatId);
    const start = anchorStart(beat.text, action.anchor);
    if (start < 0)
      errors.push(
        `Anchor ${JSON.stringify(action.anchor)} is absent from beat ${action.beatId}`,
      );
    if (!firstAction.has(action.beatId)) {
      firstAction.add(action.beatId);
      if (start > 5)
        errors.push(
          `Beat ${action.beatId} begins too long before its first motion`,
        );
    }
    for (const id of action.objectIds) {
      if (!objects.has(id))
        errors.push(`Timeline references unknown object ${id}`);
      else if (!visible.has(id) && !introducing.has(action.action))
        errors.push(`Action ${action.id} uses ${id} before it is introduced`);
    }
    if (action.action === "transfer" && action.objectIds.length < 2)
      errors.push(`Transfer ${action.id} requires source and destination`);
    if (action.action === "reflow" && !action.layout)
      errors.push(`Reflow ${action.id} requires a destination layout`);
    for (const placement of action.layout ?? []) {
      if (!action.objectIds.includes(placement.objectId))
        errors.push(`Reflow ${action.id} moves an undeclared object`);
      boxes.set(placement.objectId, placement.box);
    }
    if (introducing.has(action.action))
      action.objectIds.forEach((id) => visible.add(id));
    if (action.action === "remove")
      action.objectIds.forEach((id) => visible.delete(id));
    if (visible.size > 7)
      errors.push(`Action ${action.id} leaves more than seven objects visible`);
    const active = [...visible].flatMap((id) => {
      const box = boxes.get(id);
      return box ? [{ id, box }] : [];
    });
    for (let first = 0; first < active.length; first++)
      for (let second = first + 1; second < active.length; second++) {
        const a = active[first];
        const b = active[second];
        if (a && b && overlapRatio(a.box, b.box) > 0.12)
          errors.push(`Visible objects ${a.id} and ${b.id} overlap`);
      }
  }
  for (const beat of content.beats)
    if (!seenBeats.has(beat.id))
      errors.push(`Content beat ${beat.id} has no visual action`);
  for (const camera of plan.camera) {
    const beat = content.beats.find((item) => item.id === camera.beatId);
    if (!beat)
      errors.push(`Camera action references unknown beat ${camera.beatId}`);
    else if (anchorStart(beat.text, camera.anchor) < 0)
      errors.push(`Camera anchor ${JSON.stringify(camera.anchor)} is absent`);
    const cameraBeatOrder = beatOrder.get(camera.beatId) ?? -1;
    const cameraAnchor = beat ? anchorStart(beat.text, camera.anchor) : -1;
    for (const id of camera.objectIds) {
      if (!objects.has(id)) {
        errors.push(`Camera references unknown object ${id}`);
        continue;
      }
      let available = false;
      for (const action of plan.timeline) {
        const actionOrder =
          beatOrder.get(action.beatId) ?? Number.MAX_SAFE_INTEGER;
        const actionBeat = content.beats.find(
          (item) => item.id === action.beatId,
        );
        const actionAnchor = actionBeat
          ? anchorStart(actionBeat.text, action.anchor)
          : Number.MAX_SAFE_INTEGER;
        if (
          actionOrder > cameraBeatOrder ||
          (actionOrder === cameraBeatOrder && actionAnchor > cameraAnchor)
        )
          break;
        if (action.objectIds.includes(id) && introducing.has(action.action))
          available = true;
        if (action.objectIds.includes(id) && action.action === "remove")
          available = false;
      }
      if (!available)
        errors.push(
          `Camera action ${camera.id} frames ${id} before it is visible`,
        );
    }
  }
  if (errors.length) throw new Error(errors.slice(0, 12).join("; "));
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
        `Create one continuous declarative VisualStory for this vertical technical reel. Topic: ${JSON.stringify(task.idea)}. Content: ${JSON.stringify(content)}. Trusted reusable composite primitives: ${JSON.stringify(promotedPrimitives)}.
Output JSON {version:2,world:[{id,kind,label,semantic,box:{x,y,width,height},detail?,rows?,assetId?,primitiveId?}],timeline:[{id,beatId,action,objectIds,anchor,value?,motion,layout?:[{objectId,box}]}],camera:[{id,beatId,action,objectIds,anchor,zoom}],assetIntents:[{id,query,purpose,requiredFeatures,sourcePreference:"official-first"}],proposedPrimitives:[{id,label,shapes:[{kind,x,y,width?,height?,text?,semantic}]}]}.
This is one persistent illustrated world, not separate scenes. Introduce each object once with create, reveal or draw, then preserve its identity until an explicit remove. Never reset the canvas between related beats. Use reflow with destination boxes whenever existing objects must move; nothing may teleport. Use 2–7 visible objects, stable IDs, no overlap and one primary causal motion at a time. Every beat must have at least one action, actions must follow beat order, and the first action must anchor within the first six spoken words.
Use trusted kinds ${primitiveKinds.join(", ")}, actions ${operations.join(", ")}, motion presets ${motionPresets.join(", ")}, and semantic colors ${semanticColors.join(", ")}. Prefer meaningful internal actions: row-insert for databases/tables, queue-advance, lock/unlock, highlight-code, fail/succeed, expire and branch. Transfers need source and destination. Use subtle camera actions only when framing materially improves clarity; zoom must remain 1–1.15.
Canvas coordinates are 900×1250. The art direction is polished technical SVG illustration with subtle organic black strokes, white space and restrained semantic fills. Avoid generic bordered cards unless the concept is genuinely a code card, table, browser or real image. Use an image only for a real interface/product and provide a matching official-first asset intent. Use composite only when no trusted kind works. Never request humans, avatars, decorative backgrounds, logos, watermarks, arbitrary colors or executable code. Every action and camera anchor must be an exact phrase from its content beat. ${error ? `Repair these validation errors: ${error}` : ""}`,
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
  targets?: { beatIds: string[]; objectIds: string[] },
) {
  const repaired = await gemini.generate(
    config.GEMINI_VISUAL_MODEL,
    config.GEMINI_API_KEY_FOR_VISUALS,
    `Repair this continuous declarative VisualStory after automated frame review. Content: ${JSON.stringify(content)}. Rejected story: ${JSON.stringify(rejected)}. Review defects: ${JSON.stringify(feedback)}. Allowed repair targets: ${JSON.stringify(targets ?? "the smallest unit necessary")}. Return the complete corrected VisualStory JSON. Preserve valid world IDs, asset intents and primitive specifications. Change only the listed beats and objects when targets are supplied. Preserve one continuous world; do not create scene resets or executable code.`,
    visualPlanSchema,
  );
  assertRepairScope(rejected, repaired, targets);
  return validateVisualPlan(repaired, content);
}

export function assertRepairScope(
  rejected: VisualPlan,
  repaired: VisualPlan,
  targets?: { beatIds: string[]; objectIds: string[] },
) {
  if (
    JSON.stringify(rejected.assetIntents) !==
      JSON.stringify(repaired.assetIntents) ||
    JSON.stringify(rejected.proposedPrimitives) !==
      JSON.stringify(repaired.proposedPrimitives)
  )
    throw new Error(
      "Visual quality repair cannot change validated assets or primitive specifications",
    );
  if (!targets) return;
  const beatIds = new Set(targets.beatIds);
  const objectIds = new Set(targets.objectIds);
  const changedOutsideScope = <T extends { id: string }>(
    previous: T[],
    next: T[],
    allowed: (item: T) => boolean,
    label: string,
  ) => {
    const nextById = new Map(next.map((item) => [item.id, item]));
    for (const item of previous) {
      const replacement = nextById.get(item.id);
      if (!replacement) {
        if (!allowed(item))
          throw new Error(`Repair removed unaffected ${label} ${item.id}`);
        continue;
      }
      if (
        !allowed(item) &&
        JSON.stringify(item) !== JSON.stringify(replacement)
      )
        throw new Error(`Repair changed unaffected ${label} ${item.id}`);
    }
    const previousIds = new Set(previous.map((item) => item.id));
    for (const item of next)
      if (!previousIds.has(item.id) && !allowed(item))
        throw new Error(`Repair added out-of-scope ${label} ${item.id}`);
  };
  changedOutsideScope(
    rejected.world,
    repaired.world,
    (object) => objectIds.has(object.id),
    "object",
  );
  changedOutsideScope(
    rejected.timeline,
    repaired.timeline,
    (action) =>
      beatIds.has(action.beatId) ||
      action.objectIds.some((id) => objectIds.has(id)),
    "timeline action",
  );
  changedOutsideScope(
    rejected.camera,
    repaired.camera,
    (action) =>
      beatIds.has(action.beatId) ||
      action.objectIds.some((id) => objectIds.has(id)),
    "camera action",
  );
}
