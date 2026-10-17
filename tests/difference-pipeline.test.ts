import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseVtt,
  buildMockTimeline,
  splitCaptionCues,
} from "../src/difference-pipeline/timing.js";
import { validateAssetPack } from "../src/difference-pipeline/assets.js";
import { normalizeMascotPose } from "../src/difference-pipeline/rendering.js";
import sharp from "sharp";

test("difference captions become an ordered mascot timeline", () => {
  const cues = parseVtt(
    `WEBVTT\n\n1\n00:00:00.100 --> 00:00:02.000\nWhat is the difference?\n\n2\n00:00:02.000 --> 00:00:05.000\nA browser opens websites.`,
  );
  const scenes = buildMockTimeline(cues, 5);
  assert.deepEqual(
    scenes.map(({ start, end, pose, attention }) => ({
      start,
      end,
      pose,
      attention,
    })),
    [
      { start: 0, end: 2, pose: "confused", attention: "both" },
      { start: 2, end: 5, pose: "point-left", attention: "left" },
    ],
  );
});

test("difference subtitles contain at most six words and keep real cue coverage", () => {
  const source = parseVtt(
    `1\n00:00:00.000 --> 00:00:06.000\nA browser is the application you open to move between pages.`,
  );
  const phrases = splitCaptionCues(source);
  assert.deepEqual(
    phrases.map((cue) => cue.text.split(/\s+/).length),
    [6, 5],
  );
  assert.equal(phrases[0]?.start, 0);
  assert.equal(phrases.at(-1)?.end, 6);
});

test("difference mascot pack is hash-locked and technically valid", async () => {
  const assets = await validateAssetPack(process.cwd());
  assert.equal(assets.size, 6);
  assert.ok((await readFile(assets.get("point-left") ?? "")).byteLength > 1000);
});

test("every mascot pose keeps the same bottom-center foot anchor", async () => {
  const assets = await validateAssetPack(process.cwd());
  for (const path of assets.values()) {
    const { data, info } = await sharp(await normalizeMascotPose(path))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const xs: number[] = [];
    for (let y = info.height - 45; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if ((data[(y * info.width + x) * info.channels + 3] ?? 0) >= 32)
          xs.push(x);
    assert.ok(xs.length > 0, `no foot pixels in ${path}`);
    const center = xs.reduce((total, x) => total + x, 0) / xs.length;
    assert.ok(Math.abs(center - 360) < 5, `unstable foot anchor in ${path}`);
  }
});
