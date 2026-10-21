import { test } from "node:test";
import assert from "node:assert/strict";
import {
  captionPhrases,
  captionAt,
} from "../src/automation/rendering/caption-layout.js";
import { loadSheetsConfig } from "../src/automation/operations/config.js";
import {
  command,
  assertAudio,
  measureMix,
} from "../src/automation/operations/media.js";
import { createWorkspace } from "../src/automation/workspace/index.js";
import { validateNarrationDuration } from "../src/automation/voice/index.js";
test("captions follow punctuation and hold a phrase briefly across a breath", () => {
  const words = [
    { text: "Request", start: 0, end: 0.3 },
    { text: "arrives.", start: 0.4, end: 0.7 },
    { text: "Server", start: 0.9, end: 1.2 },
    { text: "responds.", start: 1.3, end: 1.6 },
  ];
  const phrases = captionPhrases(words);
  assert.equal(phrases.length, 2);
  assert.deepEqual(
    captionAt(phrases, 0.8).map((w) => w.text),
    ["Request", "arrives."],
  );
  assert.deepEqual(
    captionAt(phrases, 0.95).map((w) => w.text),
    ["Server", "responds."],
  );
  assert.deepEqual(captionAt(phrases, 2), []);
});
test("natural narration duration is accepted without forcing exactly sixty seconds", () => {
  assert.doesNotThrow(() => validateNarrationDuration(47));
  assert.doesNotThrow(() => validateNarrationDuration(70));
  assert.throws(() => validateNarrationDuration(30), /40–75/);
  assert.throws(() => validateNarrationDuration(80), /40–75/);
});
test("control plane works without unrelated ML or publishing credentials", () => {
  const config = loadSheetsConfig({
    GOOGLE_SHEET_ID: "fixture",
    GOOGLE_CREDENTIALS: JSON.stringify({
      client_email: "test@example.com",
      private_key: "fixture",
    }),
  });
  assert.equal(config.SHEET_TAB, "Sheet1");
  assert.throws(() => loadSheetsConfig({}), /control credentials/);
});
test("audio signal validation rejects silent narration and measures a real mix", async () => {
  const workspace = await createWorkspace(
    process.cwd(),
    `audio-check-${Date.now()}`,
  );
  const signal = AbortSignal.timeout(30000);
  try {
    const silent = workspace.file("silence.wav");
    await command(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-t",
        "1",
        silent,
      ],
      signal,
    );
    await assert.rejects(assertAudio(silent, signal), /audible energy/);
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
    await assert.rejects(assertAudio(clipped, signal), /clipp/i);
    const audible = workspace.file("audible.wav");
    await command(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=24000",
        "-t",
        "1",
        audible,
      ],
      signal,
    );
    assert.equal((await assertAudio(audible, signal)).sampleRate, 24000);
    assert.ok(
      Number.isFinite((await measureMix(audible, signal)).integratedLufs),
    );
  } finally {
    await workspace.cleanup();
  }
});
