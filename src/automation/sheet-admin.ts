import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { google } from "googleapis";
import { z } from "zod";
import { loadSheetsConfig } from "./operations/config.js";
import { column } from "./sheets/index.js";

const valuesSchema = z.object({
  values: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
    .optional(),
});
const drafts = [
  [
    "JWT authentication vs server-side sessions",
    "Compare state, revocation, scaling, security tradeoffs and when each approach fits.",
    "",
    "comparison",
  ],
  [
    "Why database indexes sometimes slow down writes",
    "Explain the read/write tradeoff through one insert and index-maintenance example.",
    "",
    "question",
  ],
  [
    "How idempotency keys prevent duplicate payments",
    "Follow a retried payment request through API, storage and duplicate detection.",
    "",
    "scenario",
  ],
  [
    "Kafka partition ordering interview question",
    "Explain what ordering Kafka guarantees, what it does not and how key selection affects it.",
    "",
    "interview",
  ],
  [
    "Cache stampede and request coalescing",
    "Show many requests hitting an expired cache and how one shared refresh protects the database.",
    "",
    "scenario",
  ],
  [
    "Optimistic vs pessimistic database locking",
    "Compare conflict detection and blocking with one concurrent update example.",
    "",
    "comparison",
  ],
  [
    "API gateway vs load balancer",
    "Compare their responsibilities in one request path and explain when systems use both.",
    "",
    "comparison",
  ],
  [
    "What happens when a Kubernetes pod crashes?",
    "Trace health detection, restart behavior, service routing and replacement scheduling.",
    "",
    "question",
  ],
].map(([idea, description, narration, type]) => [
  idea,
  description,
  narration,
  type,
  "Backend engineers and interview candidates",
  "",
  "Draft",
]);
const headers = [
  "Idea",
  "Description",
  "Narration",
  "Type",
  "Audience",
  "Source URLs",
  "Status",
  "Task ID",
  "YT Link",
  "Insta Link",
  "FB Link",
  "Job ID",
  "Stage",
  "Last Completed",
  "Started At",
  "Timestamp",
  "Remarks",
  "Grades",
  "Cleanup",
  "Progress JSON",
];

async function main() {
  const operation = process.argv[2];
  if (!operation || !["reset-drafts", "resume-retry"].includes(operation))
    throw new Error("Expected explicit reset-drafts or resume-retry operation");
  const config = loadSheetsConfig();
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: config.credentials.client_email,
      private_key: config.credentials.private_key,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("No Sheets access token");
  const requestHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.GOOGLE_SHEET_ID)}`;
  const range = (tab: string, cells: string) =>
    `'${tab.replace(/'/g, "''")}'!${cells}`;
  const read = async (tab: string, cells: string) => {
    const response = await fetch(
      `${base}/values/${encodeURIComponent(range(tab, cells))}`,
      { headers: requestHeaders },
    );
    if (!response.ok)
      throw new Error(`Sheet backup read failed: ${response.status}`);
    const value: unknown = await response.json();
    return valuesSchema.parse(value).values ?? [];
  };
  if (operation === "resume-retry") {
    const rows = (await read(config.SHEET_TAB, "A1:AZ")).map((row) =>
      row.map(String),
    );
    const header = (rows[0] ?? []).map((value) => value.trim().toLowerCase());
    const index = (name: string) => {
      const found = header.indexOf(name.toLowerCase());
      if (found < 0) throw new Error(`Missing Sheet column ${name}`);
      return found;
    };
    const statusIndex = index("Status");
    const linkIndexes = ["YT Link", "Insta Link", "FB Link"].map(index);
    const failedOffset = rows
      .slice(1)
      .findIndex(
        (row) => (row[statusIndex] ?? "").trim().toLowerCase() === "failed",
      );
    const updates: Array<{ range: string; values: string[][] }> = [
      {
        range: range("AutomationControl", "A1:B2"),
        values: [
          ["PAUSED", "FALSE"],
          ["REASON", ""],
        ],
      },
    ];
    let retryRow: number | undefined;
    if (failedOffset >= 0) {
      retryRow = failedOffset + 2;
      const row = rows[failedOffset + 1] ?? [];
      if (linkIndexes.some((cellIndex) => (row[cellIndex] ?? "").trim()))
        throw new Error(
          `Refusing to requeue row ${retryRow}: it already contains a social link`,
        );
      const resetColumns = [
        "Status",
        "Job ID",
        "Stage",
        "Last Completed",
        "Started At",
        "Timestamp",
        "Remarks",
        "Grades",
        "Cleanup",
        "Progress JSON",
      ];
      for (const name of resetColumns) {
        const cellIndex = index(name);
        updates.push({
          range: range(config.SHEET_TAB, `${column(cellIndex)}${retryRow}`),
          values: [[name === "Status" ? "Not Posted" : ""]],
        });
      }
    }
    const response = await fetch(`${base}/values:batchUpdate`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({ valueInputOption: "RAW", data: updates }),
    });
    if (!response.ok)
      throw new Error(`Sheet resume/retry write failed: ${response.status}`);
    console.log(
      retryRow
        ? `Automation unpaused; failed row ${retryRow} requeued safely`
        : "Automation unpaused; no failed row required requeueing",
    );
    return;
  }
  const backup = {
    createdAt: new Date().toISOString(),
    spreadsheetId: config.GOOGLE_SHEET_ID,
    taskTab: config.SHEET_TAB,
    taskValues: await read(config.SHEET_TAB, "A1:AZ"),
    automationControl: await read("AutomationControl", "A1:B20"),
    primitiveReview: await read("PrimitiveReview", "A1:J"),
  };
  const artifactRoot = resolve(
    process.cwd(),
    ".sheet-admin-backup",
    process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`,
  );
  await mkdir(artifactRoot, { recursive: true });
  await writeFile(
    resolve(artifactRoot, "sheet-backup.json"),
    JSON.stringify(backup, null, 2),
  );
  for (const [tab, cells] of [
    [config.SHEET_TAB, "A1:AZ"],
    ["PrimitiveReview", "A2:J"],
  ] as const) {
    const response = await fetch(
      `${base}/values/${encodeURIComponent(range(tab, cells))}:clear`,
      { method: "POST", headers: requestHeaders, body: "{}" },
    );
    if (!response.ok)
      throw new Error(`Sheet clear failed for ${tab}: ${response.status}`);
  }
  const response = await fetch(`${base}/values:batchUpdate`, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: [
        {
          range: range(config.SHEET_TAB, `A1:T${drafts.length + 1}`),
          values: [headers, ...drafts],
        },
        {
          range: range("AutomationControl", "A1:B2"),
          values: [
            ["PAUSED", "FALSE"],
            ["REASON", ""],
          ],
        },
      ],
    }),
  });
  if (!response.ok)
    throw new Error(`Sheet reset write failed: ${response.status}`);
  console.log(
    `Sheet reset complete: ${drafts.length} Draft rows; automation unpaused; backup ${artifactRoot}`,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
