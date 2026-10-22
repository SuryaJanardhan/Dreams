import { test } from "node:test";
import assert from "node:assert/strict";
import { alignCaptions } from "../src/automation/captions/index.js";
import type { ContentPlan } from "../src/automation/domain.js";
const plan: ContentPlan = {
  type: "question",
  title: "API",
  narration: "An API connects software",
  beats: [
    { id: "one", text: "An API", purpose: "Introduce the interface" },
    { id: "two", text: "connects software", purpose: "Show the connection" },
  ],
  copies: {
    youtube: { title: "API", description: "API" },
    instagram: { title: "API", description: "API" },
    facebook: { title: "API", description: "API" },
  },
  research: { mode: "gemini-best-effort", summary: "Fixture", sources: [] },
  grade: 100,
};
const narration = { path: "fixture.wav", duration: 2, sampleRate: 24000 };
test("caption alignment corrects technical spelling using actual word times and maps beats", () => {
  const track = alignCaptions(plan, narration, [
    { text: "An", start: 0, end: 0.2 },
    { text: "api", start: 0.3, end: 0.5 },
    { text: "connects", start: 0.6, end: 1 },
    { text: "software", start: 1.1, end: 1.8 },
  ]);
  assert.equal(track.words[1]?.text, "API");
  assert.equal(track.beats[1]?.start, 0.6);
  assert.equal(track.beats[1]?.end, 1.8);
});
test("missing speech and invalid time overlap cannot be hidden by caption generation", () => {
  assert.throws(
    () => alignCaptions(plan, narration, [{ text: "An", start: 0, end: 0.2 }]),
    /differs/,
  );
  assert.throws(
    () =>
      alignCaptions(plan, narration, [
        { text: "An", start: 0, end: 1 },
        { text: "API", start: 0.5, end: 1.2 },
      ]),
    /timings/,
  );
});
