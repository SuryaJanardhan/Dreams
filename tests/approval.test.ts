import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  ApprovalPackage,
  Progress,
  Publication,
} from "../src/automation/domain.js";
import {
  runApprovalDecision,
  type ApprovalDecisionDependencies,
} from "../src/automation/approval/decision.js";
import { ApprovalStore } from "../src/automation/approval/store.js";
import { Http, type Request } from "../src/automation/operations/http.js";

function progress(): Progress {
  return {
    jobId: "job-1",
    task: {
      id: "task-1",
      row: 2,
      idea: "JWT vs sessions",
      description: "",
      narration: "",
      type: "comparison",
      audience: "developers",
      sourceUrls: [],
    },
    status: "AwaitingApproval",
    stage: "approval",
    lastCompleted: "approval",
    startedAt: "2026-10-28T00:00:00.000Z",
    updatedAt: "2026-10-28T00:00:00.000Z",
    publications: [
      {
        platform: "youtube",
        state: "NotAttempted",
        detail: "Approval required",
      },
      {
        platform: "instagram",
        state: "NotAttempted",
        detail: "Approval required",
      },
      {
        platform: "facebook",
        state: "NotAttempted",
        detail: "Approval required",
      },
    ],
    remarks: "Waiting for review",
    cleanup: [],
    grades: { content: 95, rendering: 92 },
  };
}

function approval(status: "approved" | "rejected"): ApprovalPackage {
  return {
    id: "approval-1",
    status,
    previewKey: "reviews/job-1/final.mp4",
    expiresAt: "2026-10-31T00:00:00.000Z",
    progress: progress(),
    plan: {
      type: "comparison",
      title: "JWT vs sessions",
      narration: "Example",
      beats: [],
      copies: {
        youtube: { title: "JWT vs sessions", description: "YT" },
        instagram: { title: "JWT vs sessions", description: "IG" },
        facebook: { title: "JWT vs sessions", description: "FB" },
      },
      research: { mode: "gemini-best-effort", summary: "Fixture", sources: [] },
      grade: 95,
    },
    video: {
      path: "",
      duration: 60,
      width: 1080,
      height: 1920,
      fps: 60,
      grade: 92,
    },
  };
}

function fixture(decision: ApprovalPackage | null) {
  const events: string[] = [];
  const publications: Publication[] = [];
  const deps: ApprovalDecisionDependencies = {
    claim: async () => decision,
    workspace: async () => ({
      path: "/tmp/approval-1",
      file: (name) => `/tmp/approval-1/${name}`,
      cleanup: async () => {
        events.push("workspace-cleaned");
        return ["Workspace removed"];
      },
    }),
    download: async (_record, workspace) => ({
      ...approval("approved").video,
      path: workspace.file("final.mp4"),
    }),
    publish: async (_video, _plan, _workspace, record) => {
      events.push("publish");
      for (const platform of ["youtube", "instagram", "facebook"] as const) {
        const result: Publication = {
          platform,
          state: "Published",
          id: `${platform}-1`,
          url: `https://example.com/${platform}-1`,
        };
        publications.push(result);
        await record(result);
      }
    },
    save: async () => {
      events.push("save");
    },
    finish: async (_record, status) => {
      events.push(`finish:${status}`);
      return ["Preview removed"];
    },
    pause: async () => {
      events.push("pause");
    },
    notify: async () => {
      events.push("email");
    },
    now: () => new Date("2026-10-28T01:00:00.000Z"),
  };
  return { deps, events, publications };
}

test("an approved review is the only path that reaches social publishing", async () => {
  const approved = fixture(approval("approved"));
  const result = await runApprovalDecision(approved.deps, "approval-1");
  assert.equal(result.state, "Completed");
  assert.equal(approved.publications.length, 3);
  assert.ok(approved.events.includes("publish"));
  assert.ok(approved.events.includes("finish:completed"));
});

test("rejection records the decision and never calls a social publisher", async () => {
  const rejected = fixture(approval("rejected"));
  const result = await runApprovalDecision(rejected.deps, "approval-1");
  assert.equal(result.state, "Rejected");
  assert.ok(!rejected.events.includes("publish"));
  assert.ok(rejected.events.includes("finish:rejected"));
  assert.ok(!rejected.events.includes("pause"));
});

test("rejection confirmation email failure never pauses healthy scheduling", async () => {
  const rejected = fixture(approval("rejected"));
  rejected.deps.notify = async () => {
    throw new Error("SMTP unavailable");
  };
  const result = await runApprovalDecision(rejected.deps, "approval-1");
  assert.equal(result.state, "Rejected");
  assert.ok(!rejected.events.includes("publish"));
  assert.ok(!rejected.events.includes("pause"));
  assert.match(result.notification, /failed/);
});

test("no decided review is a successful no-op", async () => {
  const empty = fixture(null);
  const result = await runApprovalDecision(empty.deps);
  assert.deepEqual(result, { state: "NoDecision" });
  assert.deepEqual(empty.events, []);
});

class ApprovalHttpFixture extends Http {
  calls: Array<{ url: string; request: Request }> = [];
  insertedBody = "";
  constructor() {
    super(() => new AbortController().signal);
  }
  override async response(url: string, request: Request = {}) {
    this.calls.push({ url, request });
    if (url.includes("/rest/v1/approval_requests") && request.method === "POST")
      this.insertedBody = String(request.body);
    return new Response("{}", { status: 200 });
  }
  override async json<T>(
    url: string,
    schema: z.ZodType<T>,
    request: Request = {},
  ): Promise<T> {
    this.calls.push({ url, request });
    const value = url.includes("/object/sign/")
      ? { signedURL: "/storage/v1/object/sign/videos/reviews/signed" }
      : [];
    return schema.parse(value);
  }
}

test("review request stores only a token hash before emailing safe GET links", async () => {
  const http = new ApprovalHttpFixture();
  const store = new ApprovalStore(
    {
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      SUPABASE_BUCKET: "videos",
      APPROVAL_TTL_HOURS: 72,
    },
    http,
    () => new Date("2026-10-28T00:00:00.000Z"),
  );
  const directory = `/tmp/dreams-approval-test-${process.pid}`;
  await mkdir(directory, { recursive: true });
  const path = `${directory}/final.mp4`;
  await writeFile(path, "video");
  let links: { reviewUrl: string; previewUrl: string } | undefined;
  const request = await store.prepare(
    { ...approval("approved").video, path },
    approval("approved").plan,
    progress(),
  );
  links = { reviewUrl: request.reviewUrl, previewUrl: request.previewUrl };
  assert.equal(request.approval.status, "pending");
  assert.ok(links?.reviewUrl.includes("/functions/v1/review-approval#token="));
  assert.ok(links?.previewUrl.startsWith("https://project.supabase.co/"));
  const reviewUrl = new URL(links?.reviewUrl ?? "");
  assert.equal(reviewUrl.search, "");
  const token = new URLSearchParams(reviewUrl.hash.slice(1)).get("token");
  assert.ok(token);
  assert.ok(!http.insertedBody.includes(token ?? ""));
  assert.ok(http.insertedBody.includes('"status":"AwaitingApproval"'));
  assert.ok(
    http.insertedBody.includes(
      createHash("sha256")
        .update(token ?? "")
        .digest("hex"),
    ),
  );
});
