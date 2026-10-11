import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseHeaders,
  taskFromRow,
  column,
} from "../src/automation/sheets/index.js";
test("only Not Posted is eligible, with aliases, supplied narration, and no accidental republish", () => {
  const fields = parseHeaders(["Topic", "Status", "Scripts", "YT Link"]);
  assert.equal(taskFromRow(["API", "pending"], 2, fields), null);
  const task = taskFromRow(
    ["API", "Not Posted", "Use supplied words"],
    3,
    fields,
  );
  assert.equal(task?.narration, "Use supplied words");
  assert.equal(task?.row, 3);
  assert.throws(
    () =>
      taskFromRow(
        ["API", "Not Posted", "", "https://youtube.com/watch?v=old"],
        4,
        fields,
      ),
    /Existing social links/,
  );
  assert.throws(() => parseHeaders(["Idea", "Topic", "Status"]), /Ambiguous/);
  assert.equal(column(26), "AA");
});
