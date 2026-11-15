import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseVtt,
  buildMockTimeline,
  splitCaptionCues,
} from "../src/difference-pipeline/timing.js";
import { validateAssetPack } from "../src/difference-pipeline/assets.js";
import {
  layoutCaption,
  normalizeMascotPose,
  renderMock,
  visualMode,
} from "../src/difference-pipeline/rendering.js";
import sharp from "sharp";
import { PassThrough } from "node:stream";
import { writeWithBackpressure } from "../src/difference-pipeline/process.js";
import { validateComparisonRetention } from "../src/difference-pipeline/quality.js";
import { assertCleanNarration } from "../src/difference-pipeline/audio.js";
import { command } from "../src/automation/operations/media.js";
import { createWorkspace } from "../src/automation/workspace/index.js";

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

test("difference subtitles use actual word times and contain at most six words", () => {
  const source = parseVtt(
    `1\n00:00:00.000 --> 00:00:06.000\nA browser is the application you open to move between pages.`,
  );
  const phrases = splitCaptionCues(source, [
    { text: "A", start: 0.1, end: 0.2 },
    { text: "browser", start: 0.2, end: 1.1 },
    { text: "is", start: 1.2, end: 1.35 },
    { text: "the", start: 1.4, end: 1.55 },
    { text: "application", start: 1.7, end: 2.8 },
    { text: "you", start: 3.2, end: 3.4 },
    { text: "open", start: 3.5, end: 3.9 },
    { text: "to", start: 4.2, end: 4.35 },
    { text: "move", start: 4.4, end: 4.8 },
    { text: "between", start: 5.0, end: 5.45 },
    { text: "pages.", start: 5.5, end: 5.9 },
  ]);
  assert.deepEqual(
    phrases.map((cue) => cue.text.split(/\s+/).length),
    [6, 5],
  );
  assert.equal(phrases[0]?.start, 0.1);
  assert.equal(phrases[0]?.end, 3.4);
  assert.equal(phrases.at(-1)?.start, 3.5);
  assert.equal(phrases.at(-1)?.end, 5.9);
  assert.equal(buildMockTimeline(phrases, 6)[0]?.role, "hook");
});

test("difference timing rejects extra spoken words outside the approved script", () => {
  const source = parseVtt(
    `1\n00:00:00.000 --> 00:00:02.000\nBrowser opens pages.`,
  );
  assert.throws(
    () =>
      splitCaptionCues(source, [
        { text: "Browser", start: 0, end: 0.4 },
        { text: "opens", start: 0.5, end: 0.8 },
        { text: "pages.", start: 0.9, end: 1.2 },
        { text: "unexpected", start: 1.3, end: 1.8 },
      ]),
    /extra spoken words/,
  );
});

test("difference timing rejects different speech with the same word count", () => {
  const source = parseVtt(
    `1\n00:00:00.000 --> 00:00:02.000\nBrowser opens pages.`,
  );
  assert.throws(
    () =>
      splitCaptionCues(source, [
        { text: "Servers", start: 0, end: 0.4 },
        { text: "delete", start: 0.5, end: 0.8 },
        { text: "files.", start: 0.9, end: 1.2 },
      ]),
    /differ too much/,
  );
});

test("difference mascot pack is hash-locked and technically valid", async () => {
  const assets = await validateAssetPack(process.cwd());
  assert.equal(assets.size, 12);
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

test("mock renderer refuses to clean an unowned output directory", async () => {
  await assert.rejects(
    renderMock(process.cwd(), "unused.mp3", [], process.cwd()),
    /owned temp-difference output/,
  );
});

test("subtitle layout preserves every long technical word", () => {
  const text =
    "Authentication authorization infrastructure orchestration configurations differ.";
  const layout = layoutCaption(text);
  assert.equal(layout.lines.join(" "), text);
  assert.ok(layout.lines.length <= 3);
  assert.ok(layout.fontSize >= 46);
});

test("subtitle layout rejects one identifier wider than the safe area", () => {
  assert.throws(
    () => layoutCaption("authenticationauthorizationinfrastructureconfiguration"),
    /too wide/,
  );
});

test("frame writer surfaces encoder failure while backpressured", async () => {
  const stream = new PassThrough({ highWaterMark: 1 });
  const completion = Promise.reject(new Error("encoder closed"));
  await assert.rejects(
    writeWithBackpressure(stream, Buffer.alloc(4096), completion),
    /encoder closed/,
  );
});

test("the relatable car and map analogy changes the demonstrated visual", () => {
  assert.equal(
    visualMode({
      start: 20,
      end: 25,
      text: "Think of the browser as a car",
      role: "scenario",
      pose: "compare-both",
      attention: "both",
    }),
    "car-map",
  );
});

test("retention gate rejects a generic hook that does not name both concepts", () => {
  assert.throws(
    () =>
      validateComparisonRetention("Browser", "Search Engine", [
        {
          start: 0,
          end: 3,
          text: "Here is something interesting.",
          role: "hook",
          pose: "confused",
          attention: "both",
        },
        {
          start: 3,
          end: 28,
          text: "A useful explanation with a real example.",
          role: "scenario",
          pose: "compare-both",
          attention: "both",
        },
        {
          start: 28,
          end: 32,
          text: "Browser and search engine differ.",
          role: "memory-rule",
          pose: "conclusion",
          attention: "both",
        },
      ]),
    /opening must name both concepts/,
  );
});

test("committed comparison fixture passes timing and retention gates", async () => {
  const directory = "assets/difference-pipeline/mock";
  const cues = parseVtt(
    await readFile(`${directory}/browser-vs-search-engine.vtt`, "utf8"),
  );
  const words: unknown = JSON.parse(
    await readFile(`${directory}/browser-vs-search-engine.words.json`, "utf8"),
  );
  assert.ok(Array.isArray(words));
  const phrases = splitCaptionCues(cues, words);
  const scenes = buildMockTimeline(phrases, 34.896);
  const result = validateComparisonRetention(
    "Browser",
    "Search Engine",
    scenes,
  );
  assert.equal(result.sceneCount, 15);
  assert.ok(scenes.some((scene) => visualMode(scene) === "car-map"));
});

test("difference narration rejects clipped source audio before mixing", async () => {
  const workspace = await createWorkspace(
    process.cwd(),
    `difference-clipping-${Date.now()}`,
  );
  const signal = AbortSignal.timeout(30000);
  try {
    const clipped = workspace.file("clipped.wav");
    await command(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=24000",
        "-af",
        "volume=100",
        "-t",
        "1",
        clipped,
      ],
      signal,
    );
    await assert.rejects(
      assertCleanNarration(clipped, signal, { minSeconds: 0.5, maxSeconds: 2 }),
      /clipp/i,
    );
  } finally {
    await workspace.cleanup();
  }
});
