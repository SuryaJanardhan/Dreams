import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runWorkflow,
  type WorkflowDependencies,
} from "../src/automation/workflow/index.js";
import type { Progress } from "../src/automation/domain.js";
function fixture() {
  const events: string[] = [];
  const snapshots: Progress[] = [];
  const deps: WorkflowDependencies = {
    preflight: async () => {},
    intake: async () => ({
      kind: "task",
      task: {
        id: "topic-1",
        row: 2,
        idea: "API",
        description: "",
        narration: "",
        type: "",
        audience: "",
        sourceUrls: [],
      },
    }),
    save: async (p) => {
      snapshots.push(structuredClone(p));
      events.push(`save:${p.status}`);
    },
    pause: async () => {
      events.push("pause");
    },
    workspace: async () => ({
      path: "/isolated/job",
      file: (n) => n,
      cleanup: async () => {
        events.push("clean-local");
        return ["Local media removed"];
      },
    }),
    research: async () => ({
      mode: "gemini-best-effort",
      summary: "Fixture research",
      sources: [],
    }),
    content: async (_task, research) => ({
      type: "question",
      title: "API",
      narration: "example",
      beats: [],
      copies: {
        youtube: { title: "API", description: "YouTube" },
        instagram: { title: "API", description: "Instagram" },
        facebook: { title: "API", description: "Facebook" },
      },
      research,
      grade: 95,
    }),
    promotedPrimitives: async () => [],
    visualPlan: async () => ({
      version: 2,
      world: [],
      timeline: [],
      camera: [],
      assetIntents: [],
      proposedPrimitives: [],
    }),
    recordPrimitiveReviews: async () => "https://example.org/review",
    assets: async () => [],
    voice: async () => ({ path: "voice.wav", duration: 60, sampleRate: 24000 }),
    captions: async () => ({ words: [], beats: [], duration: 60 }),
    render: async () => ({
      path: "video.mp4",
      duration: 60.5,
      width: 1080,
      height: 1920,
      fps: 60,
      grade: 90,
    }),
    quality: async (_plan, _visual, _assets, _voice, _captions, video) => video,
    prepareApproval: async () => ({
      summary: {
        id: "approval-1",
        status: "pending" as const,
        previewKey: "reviews/job-1/final.mp4",
        expiresAt: "2026-10-15T00:00:00.000Z",
      },
      deliver: async () => {
        events.push("approval-email");
      },
      revoke: async () => {
        events.push("approval-revoked");
      },
    }),
    cleanupStaging: async () => {
      events.push("clean-staging");
      return ["Staging removed"];
    },
    notify: async () => {
      events.push("email");
    },
    cancelled: () => false,
    now: () => new Date("2026-10-12T00:00:00Z"),
  };
  return { deps, events, snapshots };
}
test("quality completion requests review and cannot call social publishers", async () => {
  const { deps, events, snapshots } = fixture();
  const result = await runWorkflow(deps);
  assert.equal(result.state, "AwaitingApproval");
  assert.ok(events.includes("approval-email"));
  assert.ok(events.indexOf("clean-local") < events.indexOf("approval-email"));
  assert.ok(
    !events.some((event) =>
      ["youtube", "instagram", "facebook"].includes(event),
    ),
  );
  assert.ok(!events.includes("pause"));
  assert.equal(snapshots.at(-1)?.lastCompleted, "approval");
});
test("empty queue never creates a workspace, pauses, or sends email", async () => {
  const { deps, events } = fixture();
  deps.intake = async () => ({ kind: "empty" });
  assert.equal((await runWorkflow(deps)).state, "NoWork");
  assert.deepEqual(events, []);
});
test("render failure stops publication but still pauses, cleans, and reports the failed stage", async () => {
  const { deps, events, snapshots } = fixture();
  deps.render = async () => {
    throw new Error("Blank scene");
  };
  assert.equal((await runWorkflow(deps)).state, "Failed");
  assert.ok(!events.includes("youtube"));
  assert.ok(events.includes("email"));
  assert.equal(snapshots.at(-1)?.stage, "rendering");
  assert.equal(snapshots.at(-1)?.lastCompleted, "captions");
});
test("cleanup failure preserves the review record but pauses further generation", async () => {
  const { deps, events } = fixture();
  deps.cleanupStaging = async () => {
    throw new Error("Storage deletion rejected");
  };
  const outcome = await runWorkflow(deps);
  assert.equal(outcome.state, "Failed");
  assert.ok(events.includes("pause"));
  assert.ok(events.includes("approval-revoked"));
  assert.ok(
    "progress" in outcome &&
      outcome.progress.remarks.includes("Cleanup Failed"),
  );
  assert.ok(events.includes("clean-local"));
});

test("review email failure revokes the link and pauses without publishing", async () => {
  const { deps, events } = fixture();
  const prepared = await deps.prepareApproval(
    {
      path: "video.mp4",
      duration: 60,
      width: 1080,
      height: 1920,
      fps: 60,
      grade: 90,
    },
    {
      type: "question",
      title: "fixture",
      narration: "fixture",
      beats: [],
      copies: {
        youtube: { title: "fixture", description: "fixture" },
        instagram: { title: "fixture", description: "fixture" },
        facebook: { title: "fixture", description: "fixture" },
      },
      research: {
        mode: "gemini-best-effort",
        summary: "fixture",
        sources: [],
      },
      grade: 90,
    },
    {} as Progress,
  );
  deps.prepareApproval = async () => ({
    ...prepared,
    deliver: async () => {
      throw new Error("SMTP unavailable");
    },
  });
  const result = await runWorkflow(deps);
  assert.equal(result.state, "Failed");
  assert.ok(events.includes("approval-revoked"));
  assert.ok(events.includes("pause"));
});

test("graceful cancellation clears local work, records the stopping stage and emails", async () => {
  const { deps, events, snapshots } = fixture();
  let cancelled = false;
  deps.cancelled = () => cancelled;
  deps.voice = async () => {
    cancelled = true;
    throw new Error("Cancellation requested during synthesis");
  };
  assert.equal((await runWorkflow(deps)).state, "Cancelled");
  assert.equal(snapshots.at(-1)?.stage, "voice");
  assert.ok(events.includes("pause"));
  assert.ok(events.includes("clean-local"));
  assert.ok(events.includes("email"));
  assert.ok(!events.includes("youtube"));
});

test("stale processing is interrupted and reported without resuming any stage", async () => {
  const { deps, events, snapshots } = fixture();
  const previous = await runWorkflow(deps);
  assert.ok("progress" in previous);
  if (!("progress" in previous)) throw new Error("Missing fixture progress");
  const progress = structuredClone(previous.progress);
  progress.status = "Processing";
  events.length = 0;
  snapshots.length = 0;
  deps.intake = async () => ({ kind: "interrupted", progress });
  deps.content = async () => {
    throw new Error("Must not resume");
  };
  assert.equal((await runWorkflow(deps)).state, "Interrupted");
  assert.ok(events.includes("pause"));
  assert.ok(events.includes("email"));
  assert.ok(!events.includes("youtube"));
});

test("a lost final Sheet write cannot report an operationally safe review handoff", async () => {
  const { deps } = fixture();
  const originalSave = deps.save;
  deps.save = async (p) => {
    if (p.status === "AwaitingApproval") throw new Error("Sheet unavailable");
    await originalSave(p);
  };
  const result = await runWorkflow(deps);
  assert.ok("progress" in result);
  if (!("progress" in result)) throw new Error("Missing progress");
  assert.equal(result.state, "Failed");
  assert.equal(result.operationalSuccess, false);
  assert.equal(result.progress.finalization?.persistence, "failed");
  assert.equal(result.progress.finalization?.pause, "saved");
  assert.equal(
    result.progress.publications.filter((p) => p.state === "Published").length,
    0,
  );
});
