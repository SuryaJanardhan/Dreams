import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { Sheets } from "../src/automation/sheets/index.js";
import { Http, type Request } from "../src/automation/operations/http.js";
import { loadSheetsConfig } from "../src/automation/operations/config.js";
class SheetFixture extends Http {
  writes: string[] = [];
  constructor() {
    super(() => new AbortController().signal);
  }
  override async json<T>(url: string, schema: z.ZodType<T>): Promise<T> {
    const decoded = decodeURIComponent(url);
    const value = decoded.includes("AutomationControl")
      ? {
          values: [
            ["PAUSED", "FALSE"],
            ["REASON", ""],
          ],
        }
      : decoded.includes("A2:AZ")
        ? { values: [["API", "Not Posted", ""]] }
        : decoded.includes("/values/")
          ? { values: [["Idea", "Status", "Task ID"]] }
          : {
              sheets: [
                { properties: { title: "Sheet1" } },
                { properties: { title: "AutomationControl" } },
              ],
            };
    return schema.parse(value);
  }
  override async response(_url: string, request: Request = {}) {
    const body = String(request.body ?? "");
    this.writes.push(body);
    if (body.includes("C2")) throw new Error("Sheet write unavailable");
    return new Response("{}");
  }
}
test("Task ID persistence failure is an infrastructure error, not an invalid content row", async () => {
  const config = loadSheetsConfig({
    GOOGLE_SHEET_ID: "fixture",
    GOOGLE_CREDENTIALS: JSON.stringify({
      client_email: "test@example.com",
      private_key: "fixture",
    }),
  });
  const http = new SheetFixture();
  const sheets = new Sheets(config, http, {
    getAccessToken: async () => "fixture",
  });
  await sheets.prepare();
  await assert.rejects(sheets.intake(), /Sheet write unavailable/);
  assert.ok(!http.writes.some((body) => body.includes("Invalid")));
});
