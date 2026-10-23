import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorkspace } from "../src/automation/workspace/index.js";
import {
  objectGeometryErrors,
  renderVideo,
} from "../src/automation/rendering/index.js";
import { command } from "../src/automation/operations/media.js";
import type { ContentPlan, CaptionTrack } from "../src/automation/domain.js";
test("persistent visual objects reject geometry drift between scenes", () => {
  const expected = [
    {
      id: "request",
      box: { x: 100, y: 200, width: 180, height: 120 },
    },
  ];
  assert.deepEqual(
    objectGeometryErrors(expected, [
      { id: "request", x: 101, y: 199, width: 178, height: 121 },
    ]),
    [],
  );
  assert.match(
    objectGeometryErrors(expected, [
      { id: "request", x: 350, y: 200, width: 180, height: 120 },
    ]).join(";"),
    /position drifted/,
  );
});
for (const topic of ["API", "Load Balancer", "Cache"])
  test(`frame export produces a captioned 1080p60 ${topic} clip without screen recording`, async () => {
    const workspace = await createWorkspace(
      process.cwd(),
      `render-${topic.replace(/ /g, "-")}-${Date.now()}`,
    );
    const signal = AbortSignal.timeout(120000);
    try {
      const audio = workspace.file("fixture.wav");
      await command(
        "ffmpeg",
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:sample_rate=24000",
          "-t",
          "0.75",
          audio,
        ],
        signal,
      );
      const plan: ContentPlan = {
        type: "question",
        title: topic,
        narration: topic,
        beats: [
          { id: "explain", text: topic, purpose: "Show the technical idea" },
        ],
        copies: {
          youtube: { title: topic, description: topic },
          instagram: { title: topic, description: topic },
          facebook: { title: topic, description: topic },
        },
        research: {
          mode: "gemini-best-effort",
          summary: "Fixture",
          sources: [],
        },
        grade: 100,
      };
      const parts = topic.split(" ");
      const words = parts.map((text, index) => ({
        text,
        start: (index * 0.75) / parts.length,
        end: ((index + 1) * 0.75) / parts.length,
      }));
      const track: CaptionTrack = {
        words,
        duration: 0.75,
        beats: [{ ...plan.beats[0]!, start: 0, end: 0.75 }],
      };
      const result = await renderVideo(
        plan,
        {
          version: 2,
          world: [
            {
              id: "concept",
              kind: "api",
              label: topic,
              semantic: "active",
              box: { x: 200, y: 300, width: 500, height: 240 },
            },
          ],
          timeline: [
            {
              id: "introduce-concept",
              beatId: "explain",
              action: "create",
              objectIds: ["concept"],
              anchor: parts[0]!,
              motion: "soft-enter",
            },
          ],
          camera: [],
          assetIntents: [],
          proposedPrimitives: [],
        },
        { path: audio, duration: 0.75, sampleRate: 24000 },
        track,
        workspace,
        {
          config: { root: process.cwd() },
          signal,
        },
      );
      assert.equal(result.fps, 60);
      assert.equal(result.width, 1080);
      assert.equal(result.height, 1920);
      assert.ok(Math.abs(result.duration - 0.75) < 0.1);
    } finally {
      await workspace.cleanup();
    }
  });
