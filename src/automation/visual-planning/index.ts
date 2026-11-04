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
  TimelineAction,
} from "../domain.js";
import { twice } from "../operations/http.js";
import type { StructuredGenerator } from "../ai/index.js";

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
export function safeVisualIdentifier(value: string): string {
  let result = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!/^[a-z]/.test(result)) result = `item-${result}`;
  if (result.length < 3) result = `${result}-item`;
  return result.slice(0, 51).replace(/-+$/g, "");
}
const identifierSchema = z
  .string()
  .transform(safeVisualIdentifier)
  .pipe(z.string().regex(/^[a-z][a-z0-9-]{1,50}$/));
export function safeVisualBox(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  const numbers = [input.x, input.y, input.width, input.height].map(Number);
  if (!numbers.every(Number.isFinite)) return value;
  const x = Math.max(0, Math.min(820, Math.round(numbers[0]!)));
  const y = Math.max(0, Math.min(1170, Math.round(numbers[1]!)));
  const width = Math.max(80, Math.min(760, 900 - x, Math.round(numbers[2]!)));
  const height = Math.max(60, Math.min(560, 1250 - y, Math.round(numbers[3]!)));
  return { ...input, x, y, width, height };
}
const boxSchema: z.ZodType<VisualBox> = z.preprocess(
  safeVisualBox,
  z
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
    ),
);
const primitiveSpecSchema: z.ZodType<PrimitiveSpec> = z
  .object({
    id: identifierSchema,
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

function normalizedMotion(action: unknown): MotionPreset {
  if (["create", "reveal"].includes(String(action))) return "soft-enter";
  if (action === "draw") return "draw-path";
  if (action === "transfer") return "travel-path";
  if (action === "reflow") return "rearrange";
  if (action === "focus" || action === "dim") return "focus";
  if (action === "settle") return "settle";
  if (action === "remove") return "soft-exit";
  if (
    [
      "row-insert",
      "queue-advance",
      "lock",
      "unlock",
      "highlight-code",
      "expire",
      "branch",
    ].includes(String(action))
  )
    return "internal-action";
  return "state-change";
}
function shortAnchor(value: unknown): unknown {
  if (typeof value !== "string" || value.length <= 60) return value;
  let result = "";
  for (const word of value.trim().split(/\s+/)) {
    const candidate = result ? `${result} ${word}` : word;
    if (candidate.length > 60) break;
    result = candidate;
  }
  return result || value.slice(0, 60).trim();
}
export function normalizeGeneratedVisualPlan(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const root = structuredClone(value) as Record<string, unknown>;
  for (const optionalCollection of [
    "camera",
    "assetIntents",
    "proposedPrimitives",
  ])
    if (root[optionalCollection] === undefined) root[optionalCollection] = [];
  if (Array.isArray(root.timeline))
    root.timeline = root.timeline.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        return entry;
      const action = entry as Record<string, unknown>;
      const motion = motionPresets.includes(action.motion as MotionPreset)
        ? action.motion
        : normalizedMotion(action.action);
      return {
        ...action,
        id:
          typeof action.id === "string" && action.id.trim()
            ? action.id
            : `action-${index + 1}`,
        anchor: shortAnchor(action.anchor),
        motion,
        ...(action.value === undefined
          ? {}
          : {
              value:
                typeof action.value === "string"
                  ? action.value.slice(0, 120)
                  : JSON.stringify(action.value).slice(0, 120),
            }),
      };
    });
  if (Array.isArray(root.camera))
    root.camera = root.camera.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        return entry;
      const action = entry as Record<string, unknown>;
      return {
        ...action,
        id:
          typeof action.id === "string" && action.id.trim()
            ? action.id
            : `camera-${index + 1}`,
        anchor: shortAnchor(action.anchor),
      };
    });
  return root;
}

function openingAnchor(text: string): string {
  return text.trim().split(/\s+/).slice(0, 6).join(" ").slice(0, 60);
}
export function completeVisualPlanActions(
  plan: VisualPlan,
  content: ContentPlan,
): VisualPlan {
  const firstObject = plan.world[0]?.id;
  if (!firstObject) return plan;
  const byBeat = new Map<string, typeof plan.timeline>();
  for (const action of plan.timeline) {
    const group = byBeat.get(action.beatId) ?? [];
    group.push(action);
    byBeat.set(action.beatId, group);
  }
  const timeline = content.beats.flatMap((beat, index) => {
    const actions = byBeat.get(beat.id) ?? [];
    if (actions.length) {
      return actions.map((action, actionIndex) =>
        actionIndex === 0
          ? { ...action, anchor: openingAnchor(beat.text) }
          : action,
      );
    }
    return [
      {
        id: `auto-focus-${beat.id}`,
        beatId: beat.id,
        action: index === 0 ? ("reveal" as const) : ("focus" as const),
        objectIds: [firstObject],
        anchor: openingAnchor(beat.text),
        motion: index === 0 ? ("soft-enter" as const) : ("focus" as const),
      },
    ];
  });
  const visible = new Set<string>();
  const expanded: TimelineAction[] = [];
  for (const action of timeline) {
    const introducing = new Set(["create", "reveal", "draw"]);
    const missing = action.objectIds.filter((id) => !visible.has(id));
    if (missing.length && !introducing.has(action.action))
      for (const id of missing)
        expanded.push({
          id: `auto-reveal-${id}-${action.id}`,
          beatId: action.beatId,
          action: "reveal",
          objectIds: [id],
          anchor: action.anchor,
          motion: "soft-enter",
        });
    expanded.push(action);
    if (introducing.has(action.action))
      action.objectIds.forEach((id) => visible.add(id));
    if (action.action === "remove")
      action.objectIds.forEach((id) => visible.delete(id));
  }
  return { ...plan, timeline: expanded };
}

const rawVisualPlanSchema = z
  .object({
    version: z.literal(2),
    world: z
      .array(
        z
          .object({
            id: identifierSchema,
            kind: z.enum(primitiveKinds),
            label: z.string().min(1).max(60),
            semantic: z.enum(semanticColors),
            box: boxSchema,
            detail: z.string().max(240).optional(),
            rows: z
              .array(z.array(z.string().min(1).max(30)).min(1).max(5))
              .max(5)
              .optional(),
            assetId: identifierSchema.optional(),
            primitiveId: identifierSchema.optional(),
          })
          .strict(),
      )
      .min(2)
      .max(18),
    timeline: z
      .array(
        z
          .object({
            id: identifierSchema,
            beatId: identifierSchema,
            action: z.enum(operations),
            objectIds: z.array(identifierSchema).min(1).max(7),
            anchor: z.string().min(1).max(60),
            value: z.string().max(120).optional(),
            motion: z.enum(motionPresets),
            layout: z
              .array(
                z
                  .object({
                    objectId: identifierSchema,
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
      .min(1)
      .max(48),
    camera: z
      .array(
        z
          .object({
            id: identifierSchema,
            beatId: identifierSchema,
            action: z.enum(cameraActions),
            objectIds: z.array(identifierSchema).min(1).max(7),
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
            id: identifierSchema,
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
export const visualPlanSchema: z.ZodType<VisualPlan> = z.preprocess(
  normalizeGeneratedVisualPlan,
  rawVisualPlanSchema,
);

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
  if (visible.size === 0)
    errors.push("Continuous visual story cannot leave the diagram empty");
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

export function visualContentBrief(content: ContentPlan) {
  return {
    type: content.type,
    title: content.title,
    narration: content.narration,
    beats: content.beats,
  };
}

export function createVisualPlan(groq: StructuredGenerator) {
  return (
    task: Task,
    content: ContentPlan,
    promotedPrimitives: PrimitiveSpec[] = [],
  ) =>
    twice(async (_attempt, error) => {
      const result = await groq.generate(
        `Act as a senior motion designer and technical storyboard artist. Design a visually elegant, easy-to-follow animation for this vertical technical reel. Topic: ${JSON.stringify(task.idea)}. Spoken content brief: ${JSON.stringify(visualContentBrief(content))}. Trusted reusable composite primitives: ${JSON.stringify(promotedPrimitives)}.
Output JSON {version:2,world:[{id,kind,label,semantic,box:{x,y,width,height},detail?,rows?,assetId?,primitiveId?}],timeline:[{id,beatId,action,objectIds,anchor,value?,motion,layout?:[{objectId,box}]}],camera:[{id,beatId,action,objectIds,anchor,zoom}],assetIntents:[{id,query,purpose,requiredFeatures,sourcePreference:"official-first"}],proposedPrimitives:[{id,label,shapes:[{kind,x,y,width?,height?,text?,semantic}]}]}.
This is a single continuous animated composition, never a sequence of unrelated slides. First understand the narration's cause-and-effect, then stage only the objects needed to show it. Give objects a clear spatial home and preserve their identity, scale, orientation and relationships across beats. Use the same object to show changing state: insert a row, move a token, open a lock, fill a queue, split a branch, reveal a result. Do not redraw or replace an object just to signal a new beat.
Choreograph each beat as a small visual sentence: introduce or focus the subject, perform one readable causal action, then let the result settle before the next idea. Prefer a few large, legible motions over many tiny decorative movements. Transfers must visibly travel from source to destination; use a curved path when it clarifies routing. Reflows must animate every affected object's move to its stated destination. Use staggered entrances only for related objects. Keep motion directional, paced and motivated by the spoken words. Never teleport, flash, jitter, bounce without purpose, or move the whole scene at once. Use camera motion sparingly and return to a stable composition after a close look.
Compose for a phone screen: one clear focal point per beat, strong scale hierarchy, generous negative space, balanced asymmetry, clean alignment, and labels short enough to read at a glance. Build visual contrast with size, position, line weight and the restrained semantic palette. Use organic hand-drawn strokes and purposeful connector paths; avoid the look of a dashboard made from boxes. A container is appropriate only when it represents a real object such as a table, code editor, browser, or device. Keep captions unobstructed and leave safe space near the screen edges.
Use 2–7 simultaneously visible objects, stable lowercase kebab-case IDs, and no accidental overlaps. Every beat needs at least one timeline action. Actions must follow narration beat order. The first action must anchor within the first six spoken words. Anchors must be exact phrases from the beat. Use reflow with destination boxes when an existing object moves; nothing may teleport. Every box must be at least 80×60. Reuse exact normalized IDs in every reference.
Use trusted kinds ${primitiveKinds.join(", ")}, actions ${operations.join(", ")}, motion presets ${motionPresets.join(", ")}, and semantic colors ${semanticColors.join(", ")}. Prefer meaningful internal actions: row-insert, queue-advance, lock/unlock, highlight-code, fail/succeed, expire and branch. Transfers need source and destination. Camera zoom must remain 1–1.15.
Canvas is 900×1250. Use polished technical illustration with subtle organic black strokes, white space and restrained semantic fills. Use an image only for a real interface or product and provide a matching official-first asset intent. Use composite only when no trusted kind works. Never request humans, avatars, decorative backgrounds, logos, watermarks, arbitrary colors or executable code. ${error ? `Repair these validation errors: ${error}` : ""}`,
        visualPlanSchema,
      );
      return validateVisualPlan(
        completeVisualPlanActions(result, content),
        content,
      );
    });
}

export async function repairVisualPlan(
  groq: StructuredGenerator,
  content: ContentPlan,
  rejected: VisualPlan,
  feedback: string,
  targets?: { beatIds: string[]; objectIds: string[] },
) {
  const repaired = await groq.generate(
    `Act as a senior animation director repairing a specific visual defect in one continuous technical reel. Spoken content brief: ${JSON.stringify(visualContentBrief(content))}. Current story: ${JSON.stringify(rejected)}. Frame-review defects: ${JSON.stringify(feedback)}. Allowed repair targets: ${JSON.stringify(targets ?? "the smallest unit necessary")}.
Return the complete corrected VisualStory JSON. Improve the visual explanation and motion choreography, not just the schema. Make the causal action obvious, preserve object identity and spatial continuity, and let each changed motion settle cleanly into the next beat. Favor fewer, larger, readable movements. Do not add decoration to compensate for unclear logic. Preserve valid object IDs, asset intents and primitive specifications. Change only listed beats and objects when targets are supplied. Never reset the scene, teleport objects, or add executable code.`,
    visualPlanSchema,
  );
  const completed = completeVisualPlanActions(repaired, content);
  assertRepairScope(rejected, completed, targets);
  return validateVisualPlan(completed, content);
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
