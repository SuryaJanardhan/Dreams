import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Sheets,
  parseHeaders,
  taskFromRow,
  column,
} from "../src/automation/sheets/index.js";
import { Http, type Request } from "../src/automation/operations/http.js";
import { z } from "zod";
import { parsePrimitiveSpec } from "../src/automation/visual-planning/index.js";
test("only Not Posted is eligible, with optional planning inputs and no accidental republish", () => {
  const fields = parseHeaders([
    "Topic",
    "Status",
    "Scripts",
    "YT Link",
    "Type",
    "Audience",
    "Source URLs",
  ]);
  assert.equal(taskFromRow(["API", "pending"], 2, fields), null);
  const task = taskFromRow(
    [
      "API",
      "Not Posted",
      "Use supplied words",
      "",
      "comparison",
      "junior engineers",
      "https://developer.mozilla.org/\nhttps://nodejs.org/",
    ],
    3,
    fields,
  );
  assert.equal(task?.narration, "Use supplied words");
  assert.equal(task?.row, 3);
  assert.equal(task?.type, "comparison");
  assert.equal(task?.audience, "junior engineers");
  assert.deepEqual(task?.sourceUrls, [
    "https://developer.mozilla.org/",
    "https://nodejs.org/",
  ]);
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

test("a checked primitive is revalidated before promotion and reuse", async () => {
  class PrimitiveFixture extends Http {
    writes: string[] = [];
    constructor() {
      super(() => new AbortController().signal);
    }
    override async json<T>(_url: string, schema: z.ZodType<T>): Promise<T> {
      return schema.parse({
        values: [
          [
            "job-1",
            "packet-fragment",
            "Packet fragment",
            JSON.stringify({
              id: "packet-fragment",
              label: "Packet fragment",
              shapes: [
                {
                  kind: "rect",
                  x: 10,
                  y: 10,
                  width: 40,
                  height: 30,
                  semantic: "active",
                },
              ],
            }),
            "Pending",
            "TRUE",
          ],
        ],
      });
    }
    override async response(_url: string, request: Request = {}) {
      this.writes.push(String(request.body ?? ""));
      return new Response("{}");
    }
  }
  const http = new PrimitiveFixture();
  const sheets = new Sheets(
    {
      GOOGLE_SHEET_ID: "fixture",
      SHEET_TAB: "Sheet1",
      credentials: { client_email: "test@example.com", private_key: "fixture" },
    },
    http,
    { getAccessToken: async () => "fixture" },
  );
  const primitives = await sheets.promotedPrimitives(parsePrimitiveSpec);
  assert.equal(primitives[0]?.id, "packet-fragment");
  assert.ok(http.writes.some((body) => body.includes("Promoted")));
});
