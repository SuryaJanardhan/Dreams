import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeContent } from "../src/automation/content/index.js";
test("supplied narration preserves punctuation and wording exactly, not only normalized tokens", () => {
  const text = Array.from({ length: 140 }, () => "request").join(" ") + ".";
  const task = {
    id: "fixture",
    row: 2,
    idea: "API",
    description: "",
    narration: text,
  };
  const plan = {
    title: "API",
    narration: text,
    caption: "API",
    beats: [{ id: "one", text, visual: "flow" }],
  };
  assert.equal(gradeContent(plan, task), 100);
  assert.throws(
    () => gradeContent({ ...plan, narration: text.replace(/\.$/, "!") }, task),
    /must not be rewritten/,
  );
});
