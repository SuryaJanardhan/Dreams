import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gradeContent,
  parseGroundedJson,
  requireExplanationQuality,
} from "../src/automation/content/index.js";
test("supplied narration preserves punctuation and wording exactly, not only normalized tokens", () => {
  const text = Array.from({ length: 140 }, () => "request").join(" ") + ".";
  const task = {
    id: "fixture",
    row: 2,
    idea: "API",
    description: "",
    narration: text,
    type: "question" as const,
    audience: "",
    sourceUrls: [],
  };
  const plan = {
    type: "question" as const,
    title: "API",
    narration: text,
    copies: {
      youtube: { title: "API", description: "API" },
      instagram: { title: "API", description: "API" },
      facebook: { title: "API", description: "API" },
    },
    beats: [{ id: "one", text, purpose: "Show the request flow" }],
  };
  assert.equal(gradeContent(plan, task), 100);
  assert.throws(
    () => gradeContent({ ...plan, narration: text.replace(/\.$/, "!") }, task),
    /must not be rewritten/,
  );
});

test("prohibited generic introductions are rejected instead of barely passing", () => {
  const words = [
    "Welcome,",
    ...Array.from({ length: 139 }, (_, index) => `detail${index}`),
  ];
  const narration = words.join(" ");
  const thirds = [words.slice(0, 47), words.slice(47, 94), words.slice(94)];
  assert.throws(
    () =>
      gradeContent(
        {
          type: "question",
          title: "API",
          narration,
          copies: {
            youtube: { title: "API", description: "API" },
            instagram: { title: "API", description: "API" },
            facebook: { title: "API", description: "API" },
          },
          beats: thirds.map((part, index) => ({
            id: `beat-${index}`,
            text: part.join(" "),
            purpose: "Demonstrate a concrete technical action",
          })),
        },
        {
          id: "fixture",
          row: 2,
          idea: "API",
          description: "",
          narration: "",
          type: "",
          audience: "",
          sourceUrls: [],
        },
      ),
    /generic introduction/i,
  );
});

test("explanation quality rejects a generic example despite valid formatting", () => {
  assert.throws(
    () =>
      requireExplanationQuality({
        clarity: 92,
        accuracy: 90,
        exampleUsefulness: 55,
        authenticity: 88,
        issues: ["The example could describe any topic"],
      }),
    /example usefulness/i,
  );
});

test("grounded JSON parsing accepts plain, fenced and cited wrapper text", () => {
  assert.deepEqual(parseGroundedJson('{"summary":"plain"}'), {
    summary: "plain",
  });
  assert.deepEqual(parseGroundedJson('```json\n{"summary":"fenced"}\n```'), {
    summary: "fenced",
  });
  assert.deepEqual(
    parseGroundedJson(
      'Grounded result:\n{"summary":"wrapped"}\nSources follow.',
    ),
    { summary: "wrapped" },
  );
  assert.throws(() => parseGroundedJson("no structured value"), /no JSON/);
});
