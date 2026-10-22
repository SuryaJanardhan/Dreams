import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContentPlan, VisualPlan } from "../src/automation/domain.js";
import {
  parsePrimitiveSpec,
  validateVisualPlan,
  visualPlanSchema,
} from "../src/automation/visual-planning/index.js";

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
  version: 1,
  objects: [
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
  beats: [
    {
      beatId: "shared",
      objectIds: ["queue", "stream"],
      transitions: [
        {
          operation: "create",
          objectIds: ["queue", "stream"],
          anchor: "move data",
        },
      ],
    },
    {
      beatId: "queue",
      objectIds: ["queue"],
      transitions: [
        { operation: "focus", objectIds: ["queue"], anchor: "queue" },
      ],
    },
    {
      beatId: "stream",
      objectIds: ["stream"],
      transitions: [
        { operation: "focus", objectIds: ["stream"], anchor: "stream" },
      ],
    },
  ],
  assetIntents: [],
  proposedPrimitives: [],
};

test("typed visual plans enforce story order, anchors, references, and layout", () => {
  assert.equal(validateVisualPlan(plan, content), plan);
  assert.throws(
    () =>
      validateVisualPlan(
        {
          ...plan,
          beats: plan.beats.map((beat, index) =>
            index === 0
              ? {
                  ...beat,
                  transitions: [
                    { ...beat.transitions[0]!, anchor: "missing phrase" },
                  ],
                }
              : beat,
          ),
        },
        content,
      ),
    /absent/,
  );
});

test("visual schemas reject executable escape fields and out-of-bounds primitives", () => {
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
