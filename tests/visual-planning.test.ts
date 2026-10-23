import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  CaptionTrack,
  ContentPlan,
  VisualPlan,
} from "../src/automation/domain.js";
import {
  assertRepairScope,
  parsePrimitiveSpec,
  validateVisualPlan,
  visualPlanSchema,
} from "../src/automation/visual-planning/index.js";
import {
  compileTimeline,
  evaluateTimelineAt,
} from "../src/automation/rendering/timeline.js";

const content: ContentPlan = {
  type: "comparison",
  title: "Queue vs stream",
  narration: "Both move data. A queue removes work. A stream keeps history.",
  beats: [
    { id: "shared", text: "Both move data.", purpose: "Show shared purpose" },
    { id: "queue", text: "A queue removes work.", purpose: "Show removal" },
    {
      id: "stream",
      text: "A stream keeps history.",
      purpose: "Show retention",
    },
  ],
  copies: {
    youtube: { title: "Queue vs stream", description: "Difference" },
    instagram: { title: "Queue vs stream", description: "Difference" },
    facebook: { title: "Queue vs stream", description: "Difference" },
  },
  research: { mode: "gemini-best-effort", summary: "Fixture", sources: [] },
  grade: 100,
};
const plan: VisualPlan = {
  version: 2,
  world: [
    {
      id: "queue",
      kind: "queue",
      label: "Queue",
      semantic: "active",
      box: { x: 70, y: 250, width: 300, height: 180 },
    },
    {
      id: "stream",
      kind: "database",
      label: "Stream",
      semantic: "success",
      box: { x: 530, y: 250, width: 300, height: 180 },
    },
  ],
  timeline: [
    {
      id: "create-both",
      beatId: "shared",
      action: "create",
      objectIds: ["queue", "stream"],
      anchor: "Both",
      motion: "soft-enter",
    },
    {
      id: "advance-queue",
      beatId: "queue",
      action: "queue-advance",
      objectIds: ["queue"],
      anchor: "queue",
      motion: "internal-action",
    },
    {
      id: "focus-stream",
      beatId: "stream",
      action: "focus",
      objectIds: ["stream"],
      anchor: "stream",
      motion: "focus",
    },
  ],
  camera: [
    {
      id: "frame-stream",
      beatId: "stream",
      action: "push-in",
      objectIds: ["stream"],
      anchor: "stream",
      zoom: 1.1,
    },
  ],
  assetIntents: [],
  proposedPrimitives: [],
};

test("continuous stories enforce anchors, lifecycle, ordering and references", () => {
  assert.equal(validateVisualPlan(plan, content), plan);
  assert.throws(
    () =>
      validateVisualPlan(
        {
          ...plan,
          timeline: plan.timeline.map((action, index) =>
            index === 0 ? { ...action, anchor: "missing phrase" } : action,
          ),
        },
        content,
      ),
    /absent/,
  );
  assert.throws(
    () =>
      validateVisualPlan(
        {
          ...plan,
          timeline: [
            { ...plan.timeline[1]!, id: "too-early" },
            ...plan.timeline,
          ],
        },
        content,
      ),
    /before it is introduced|beat order/,
  );
});

test("visual schemas reject executable escape fields and invalid primitives", () => {
  assert.throws(
    () => visualPlanSchema.parse({ ...plan, source: "fetch('https://bad')" }),
    /unrecognized/i,
  );
  assert.throws(
    () =>
      parsePrimitiveSpec({
        id: "packet-fragment",
        label: "Packet fragment",
        shapes: [
          {
            kind: "rect",
            x: 90,
            y: 20,
            width: 30,
            height: 20,
            semantic: "active",
          },
        ],
      }),
    /view box/,
  );
});

test("targeted visual repair cannot rewrite unaffected objects or beats", () => {
  const allowed = structuredClone(plan);
  allowed.world[0] = { ...allowed.world[0]!, label: "Message queue" };
  assert.doesNotThrow(() =>
    assertRepairScope(plan, allowed, {
      beatIds: ["queue"],
      objectIds: ["queue"],
    }),
  );
  const outOfScope = structuredClone(plan);
  outOfScope.world[1] = { ...outOfScope.world[1]!, label: "Event log" };
  assert.throws(
    () =>
      assertRepairScope(plan, outOfScope, {
        beatIds: ["queue"],
        objectIds: ["queue"],
      }),
    /unaffected object stream/,
  );
  const changedAsset = structuredClone(plan);
  changedAsset.assetIntents.push({
    id: "new-image",
    query: "unapproved image",
    purpose: "Change a validated dependency",
    requiredFeatures: ["something"],
    sourcePreference: "official-first",
  });
  assert.throws(
    () =>
      assertRepairScope(plan, changedAsset, {
        beatIds: ["queue"],
        objectIds: ["queue"],
      }),
    /validated assets/,
  );
});

test("timeline evaluation preserves objects and interpolates reflow and camera motion", () => {
  const story: VisualPlan = {
    ...plan,
    timeline: [
      plan.timeline[0]!,
      {
        id: "move-queue",
        beatId: "queue",
        action: "reflow",
        objectIds: ["queue"],
        anchor: "queue",
        motion: "rearrange",
        layout: [
          {
            objectId: "queue",
            box: { x: 300, y: 520, width: 300, height: 180 },
          },
        ],
      },
      plan.timeline[2]!,
    ],
  };
  const timedWords = [
    { text: "Both", start: 0, end: 0.3 },
    { text: "move", start: 0.3, end: 0.6 },
    { text: "data.", start: 0.6, end: 1 },
    { text: "A", start: 1.2, end: 1.4 },
    { text: "queue", start: 1.4, end: 1.8 },
    { text: "removes", start: 1.8, end: 2.1 },
    { text: "work.", start: 2.1, end: 2.5 },
    { text: "A", start: 2.7, end: 2.9 },
    { text: "stream", start: 2.9, end: 3.3 },
    { text: "keeps", start: 3.3, end: 3.6 },
    { text: "history.", start: 3.6, end: 4 },
  ];
  const track: CaptionTrack = {
    words: timedWords,
    duration: 4,
    beats: [
      { ...content.beats[0]!, start: 0, end: 1 },
      { ...content.beats[1]!, start: 1.2, end: 2.5 },
      { ...content.beats[2]!, start: 2.7, end: 4 },
    ],
  };
  const compiled = compileTimeline(story, track);
  const before = evaluateTimelineAt(story, compiled, 1.39);
  const during = evaluateTimelineAt(story, compiled, 1.75);
  const after = evaluateTimelineAt(story, compiled, 2.5);
  assert.equal(
    before.objects.find((item) => item.id === "queue")?.visible,
    true,
  );
  assert.ok(
    (during.objects.find((item) => item.id === "queue")?.box.x ?? 0) > 70,
  );
  assert.equal(after.objects.find((item) => item.id === "queue")?.box.x, 300);
  let previousX = 70;
  for (let frame = 0; frame <= 66; frame++) {
    const time = 1.4 + frame / 60;
    const currentX =
      evaluateTimelineAt(story, compiled, time).objects.find(
        (item) => item.id === "queue",
      )?.box.x ?? previousX;
    assert.ok(Math.abs(currentX - previousX) < 12, "reflow must not jump");
    previousX = currentX;
  }
  const focused = evaluateTimelineAt(story, compiled, 3.8);
  assert.ok(focused.camera.scale > 1);
  assert.equal(
    focused.objects.find((item) => item.id === "stream")?.visible,
    true,
  );
});
