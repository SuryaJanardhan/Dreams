import { google } from "googleapis";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Config } from "../operations/config.js";
import { Http } from "../operations/http.js";
import type { Progress, Task } from "../domain.js";
const cellsSchema = z.object({
  values: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
    .optional(),
});
const progressSchema: z.ZodType<Progress> = z.object({
  jobId: z.string(),
  task: z.object({
    id: z.string(),
    row: z.number().int().positive(),
    idea: z.string(),
    description: z.string(),
    narration: z.string(),
  }),
  status: z.enum([
    "Processing",
    "Completed",
    "Failed",
    "Partial",
    "Cancelled",
    "Interrupted",
  ]),
  stage: z.enum([
    "initialization",
    "content",
    "voice",
    "captions",
    "rendering",
    "publishing",
    "cleanup",
  ]),
  lastCompleted: z
    .enum([
      "initialization",
      "content",
      "voice",
      "captions",
      "rendering",
      "publishing",
      "cleanup",
    ])
    .nullable(),
  startedAt: z.string(),
  updatedAt: z.string(),
  remarks: z.string(),
  cleanup: z.array(z.string()),
  grades: z.record(z.string(), z.number()),
  publications: z.array(
    z.discriminatedUnion("state", [
      z.object({
        platform: z.enum(["youtube", "instagram", "facebook"]),
        state: z.literal("Published"),
        id: z.string().min(1),
        url: z.url(),
      }),
      z
        .object({
          platform: z.enum(["youtube", "instagram", "facebook"]),
          state: z.enum(["Failed", "Unknown", "NotAttempted"]),
          detail: z.string(),
          id: z.string().optional(),
          url: z.string().optional(),
        })
        .transform(({ id, url, ...rest }) => ({
          ...rest,
          ...(id === undefined ? {} : { id }),
          ...(url === undefined ? {} : { url }),
        })),
    ]),
  ),
});
const aliases: Record<string, string[]> = {
  idea: ["idea", "title", "topic"],
  description: ["description", "context"],
  narration: ["narration", "scripts", "script"],
  status: ["status"],
  id: ["task id", "taskid"],
  youtube: ["yt link", "youtube link", "links"],
  instagram: ["insta link", "instagram link"],
  facebook: ["fb link", "facebook link"],
  job: ["job id"],
  stage: ["stage"],
  last: ["last completed"],
  started: ["started at"],
  updated: ["timestamp", "updated at"],
  remarks: ["remarks"],
  grades: ["grades"],
  cleanup: ["cleanup"],
  progress: ["progress json"],
};
const canonical: Record<string, string> = {
  idea: "Idea",
  description: "Description",
  narration: "Narration",
  status: "Status",
  id: "Task ID",
  youtube: "YT Link",
  instagram: "Insta Link",
  facebook: "FB Link",
  job: "Job ID",
  stage: "Stage",
  last: "Last Completed",
  started: "Started At",
  updated: "Timestamp",
  remarks: "Remarks",
  grades: "Grades",
  cleanup: "Cleanup",
  progress: "Progress JSON",
};
export function column(index: number): string {
  let result = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
}
export function parseHeaders(headers: string[]): Record<string, number> {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const result: Record<string, number> = {};
  for (const [key, names] of Object.entries(aliases)) {
    const indexes = normalized.flatMap((name, index) =>
      names.includes(name) ? [index] : [],
    );
    if (indexes.length > 1)
      throw new Error(`Ambiguous Sheet headers for ${key}`);
    if (indexes[0] !== undefined) result[key] = indexes[0];
  }
  if (result.idea === undefined || result.status === undefined)
    throw new Error("Sheet requires Idea/Title/Topic and Status headers");
  return result;
}
export function taskFromRow(
  row: string[],
  rowNumber: number,
  fields: Record<string, number>,
): Task | null {
  const cell = (key: string) => {
    const index = fields[key];
    return index === undefined ? "" : (row[index] ?? "").trim();
  };
  if (cell("status").toLowerCase() !== "not posted") return null;
  const idea = cell("idea");
  if (!idea || idea.length > 200)
    throw new Error("Idea must contain 1–200 characters");
  if (["youtube", "instagram", "facebook"].some((key) => cell(key)))
    throw new Error(
      "Existing social links must be reviewed before explicitly requeueing this row",
    );
  return {
    id: cell("id") || randomUUID(),
    row: rowNumber,
    idea,
    description: cell("description"),
    narration: cell("narration"),
  };
}
export class Sheets {
  private fields: Record<string, number> = {};
  private readonly auth;
  private readonly base: string;
  constructor(
    private readonly config: Config,
    private readonly http: Http,
  ) {
    this.auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: config.credentials.client_email,
        private_key: config.credentials.private_key,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    this.base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.GOOGLE_SHEET_ID)}`;
  }
  private async headers() {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error("No Sheets access token");
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }
  private range(tab: string, range: string) {
    return `'${tab.replace(/'/g, "''")}'!${range}`;
  }
  private async read(tab: string, range: string) {
    const result = await this.http.json(
      `${this.base}/values/${encodeURIComponent(this.range(tab, range))}`,
      cellsSchema,
      { headers: await this.headers() },
    );
    return (result.values ?? []).map((row) => row.map(String));
  }
  private async write(updates: { range: string; values: string[][] }[]) {
    // Retrying absolute values is safe; never retry an upload using this helper.
    let error: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.http.response(`${this.base}/values:batchUpdate`, {
          method: "POST",
          headers: await this.headers(),
          body: JSON.stringify({ valueInputOption: "RAW", data: updates }),
        });
        return;
      } catch (cause) {
        error = cause;
      }
    }
    throw error;
  }
  async prepare() {
    const metadata = await this.http.json(
      this.base,
      z.object({
        sheets: z.array(
          z.object({ properties: z.object({ title: z.string() }) }),
        ),
      }),
      { headers: await this.headers() },
    );
    if (
      !metadata.sheets.some((s) => s.properties.title === this.config.SHEET_TAB)
    )
      throw new Error("Task Sheet tab missing");
    if (
      !metadata.sheets.some((s) => s.properties.title === "AutomationControl")
    ) {
      await this.http.response(`${this.base}:batchUpdate`, {
        method: "POST",
        headers: await this.headers(),
        body: JSON.stringify({
          requests: [
            { addSheet: { properties: { title: "AutomationControl" } } },
          ],
        }),
      });
      await this.write([
        {
          range: "AutomationControl!A1:B2",
          values: [
            ["PAUSED", "FALSE"],
            ["REASON", ""],
          ],
        },
      ]);
    }
    const rows = await this.read(this.config.SHEET_TAB, "A1:AZ1");
    const headers = rows[0] ?? [];
    this.fields = parseHeaders(headers);
    for (const [key, name] of Object.entries(canonical))
      if (this.fields[key] === undefined) {
        this.fields[key] = headers.length;
        headers.push(name);
      }
    await this.write([
      {
        range: this.range(
          this.config.SHEET_TAB,
          `A1:${column(headers.length - 1)}1`,
        ),
        values: [headers],
      },
    ]);
  }
  private async values(row: number, values: Record<string, string>) {
    const data = Object.entries(values).map(([key, value]) => {
      const index = this.fields[key];
      if (index === undefined)
        throw new Error(`Missing prepared Sheet field ${key}`);
      return {
        range: this.range(this.config.SHEET_TAB, `${column(index)}${row}`),
        values: [[value.slice(0, 45000)]],
      };
    });
    await this.write(data);
  }
  async intake() {
    const control = await this.read("AutomationControl", "A1:B2");
    const paused = control[0]?.[1]?.toUpperCase();
    if (paused === "TRUE")
      return {
        kind: "paused" as const,
        detail: control[1]?.[1] || "User intervention required",
      };
    if (paused !== "FALSE")
      throw new Error(
        "AutomationControl PAUSED must be TRUE or FALSE; refusing work",
      );
    const rows = await this.read(this.config.SHEET_TAB, "A2:AZ");
    const cell = (row: string[], key: string) => {
      const index = this.fields[key];
      return index === undefined ? "" : (row[index] ?? "");
    };
    // Look for interrupted work before selecting a new row, even when it is below a new pending row.
    for (const [offset, row] of rows.entries())
      if (cell(row, "status") === "Processing") {
        const raw = cell(row, "progress");
        let progress: Progress;
        try {
          const value: unknown = JSON.parse(raw);
          progress = progressSchema.parse(value);
        } catch {
          await this.pause(
            `Stale Processing row ${offset + 2} has invalid/missing saved progress`,
          );
          throw new Error(
            `Interrupted row ${offset + 2}: saved progress unreadable`,
          );
        }
        return { kind: "interrupted" as const, progress };
      }
    for (const [offset, row] of rows.entries()) {
      try {
        const task = taskFromRow(row, offset + 2, this.fields);
        if (task) {
          await this.values(task.row, { id: task.id });
          return { kind: "task" as const, task };
        }
      } catch (error) {
        await this.values(offset + 2, {
          status: "Invalid",
          remarks: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { kind: "empty" as const };
  }
  async save(progress: Progress) {
    const values: Record<string, string> = {
      id: progress.task.id,
      job: progress.jobId,
      status: progress.status,
      stage: progress.stage,
      last: progress.lastCompleted ?? "",
      started: progress.startedAt,
      updated: progress.updatedAt,
      remarks: progress.remarks,
      grades: JSON.stringify(progress.grades),
      cleanup: progress.cleanup.join("; "),
      progress: JSON.stringify(progress),
    };
    for (const result of progress.publications)
      if (result.state === "Published") values[result.platform] = result.url;
    await this.values(progress.task.row, values);
  }
  async pause(reason: string) {
    await this.write([
      {
        range: "AutomationControl!A1:B2",
        values: [
          ["PAUSED", "TRUE"],
          ["REASON", reason.slice(0, 3000)],
        ],
      },
    ]);
  }
}
