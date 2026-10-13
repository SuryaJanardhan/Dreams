import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { createWorkspace } from "../src/automation/workspace/index.js";
import { validateScene } from "../src/automation/rendering/code.js";
test("custom animation code must satisfy the typed contract and cannot load external capabilities", async () => {
  const parent = await mkdtemp(resolve(process.cwd(), ".scene-test-"));
  const workspace = await createWorkspace(parent, "typed-scene");
  try {
    await assert.rejects(
      validateScene(
        'export function createScene() { fetch("https://example.org"); }',
        "bad.ts",
        workspace,
        process.cwd(),
      ),
      /capability/,
    );
    await assert.rejects(
      validateScene(
        'export function createScene() { let x: number = "wrong"; return x; }',
        "bad-type.ts",
        workspace,
        process.cwd(),
      ),
      /not assignable/,
    );
    const valid = `import type { SceneContext, Scene } from './scene-contract'; export function createScene(ctx: SceneContext): Scene { const node=document.createElement('div');node.textContent='API';node.style.fontSize='60px';ctx.root.append(node);ctx.timeline.to(node,{x:80,duration:ctx.duration},0);return {dispose(){ctx.root.replaceChildren();}}; }`;
    assert.match(
      await validateScene(valid, "valid.ts", workspace, process.cwd()),
      /GeneratedScene/,
    );
  } finally {
    await workspace.cleanup();
    await rm(parent, { recursive: true });
  }
});

import { renderVideo } from "../src/automation/rendering/index.js";
import { command } from "../src/automation/operations/media.js";
import type { ContentPlan, CaptionTrack } from "../src/automation/domain.js";
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
          "0.25",
          audio,
        ],
        signal,
      );
      const plan: ContentPlan = {
        title: topic,
        narration: topic,
        caption: topic,
        beats: [{ id: "explain", text: topic, visual: "diagram" }],
        grade: 100,
      };
      const words = [{ text: topic, start: 0, end: 0.25 }];
      const track: CaptionTrack = {
        words,
        duration: 0.25,
        beats: [{ ...plan.beats[0]!, start: 0, end: 0.25 }],
      };
      const result = await renderVideo(
        plan,
        { path: audio, duration: 0.25, sampleRate: 24000 },
        track,
        workspace,
        {
          config: { root: process.cwd(), COVER_INTRO_DURATION_SEC: 0.1 },
          signal,
          generator: {
            async generate() {
              return `import type { SceneContext, Scene } from './scene-contract'; export function createScene(ctx: SceneContext): Scene { const node=document.createElement('div');node.textContent=${JSON.stringify(topic)};node.style.cssText='position:absolute;left:120px;top:240px;font-size:64px;color:#22d3ee';ctx.root.append(node);ctx.timeline.to(node,{x:50,duration:ctx.duration},0);return {dispose(){ctx.root.replaceChildren();}}; }`;
            },
          },
        },
      );
      assert.equal(result.fps, 60);
      assert.equal(result.width, 1080);
      assert.equal(result.height, 1920);
      assert.ok(Math.abs(result.duration - 0.35) < 0.1);
    } finally {
      await workspace.cleanup();
    }
  });
