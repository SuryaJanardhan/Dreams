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
    content: async () => ({
      title: "API",
      narration: "example",
      caption: "same copy",
      beats: [],
      grade: 95,
    }),
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
    publish: async (_video, _plan, _ws, record) => {
      for (const platform of ["youtube", "instagram", "facebook"] as const) {
        events.push(platform);
        await record(
          platform === "instagram"
            ? { platform, state: "Failed", detail: "rejected" }
            : {
                platform,
                state: "Published",
                id: platform,
                url: `https://example.org/${platform}`,
              },
        );
      }
    },
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
test("partial publication attempts all targets, preserves links, pauses, and cleans before email", async () => {
  const { deps, events, snapshots } = fixture();
  const result = await runWorkflow(deps);
  assert.equal(result.state, "Partial");
  assert.deepEqual(
    events.filter((e) => ["youtube", "instagram", "facebook"].includes(e)),
    ["youtube", "instagram", "facebook"],
  );
  assert.ok(events.indexOf("clean-local") < events.indexOf("email"));
  assert.ok(events.includes("pause"));
  const last = snapshots.at(-1);
  assert.equal(
    last?.publications.filter((p) => p.state === "Published").length,
    2,
  );
  assert.equal(last?.lastCompleted, "publishing");
});
test("Completed requires all verified targets and successful email sees cleanup results", async () => {
  const { deps, events } = fixture();
  deps.publish = async (_v, _p, _w, record) => {
    for (const platform of ["youtube", "instagram", "facebook"] as const)
      await record({
        platform,
        state: "Published",
        id: platform,
        url: `https://example.org/${platform}`,
      });
  };
  let email: Progress | undefined;
  deps.notify = async (p) => {
    email = structuredClone(p);
  };
  const result = await runWorkflow(deps);
  assert.equal(result.state, "Completed");
  assert.ok(!events.includes("pause"));
  assert.equal(email?.cleanup.length, 2);
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
test("cleanup failure keeps completed publications but pauses further work", async () => {
  const { deps, events } = fixture();
  deps.publish = async (_v, _p, _w, record) => {
    for (const platform of ["youtube", "instagram", "facebook"] as const)
      await record({
        platform,
        state: "Published",
        id: platform,
        url: `https://example.org/${platform}`,
      });
  };
  deps.cleanupStaging = async () => {
    throw new Error("Storage deletion rejected");
  };
  const outcome = await runWorkflow(deps);
  assert.equal(outcome.state, "Completed");
  assert.ok(events.includes("pause"));
  assert.ok(
    "progress" in outcome &&
      outcome.progress.remarks.includes("Cleanup Failed"),
  );
  assert.ok(events.includes("clean-local"));
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

test("a lost final Sheet write cannot report operational success even when posts succeeded", async () => {
  const { deps } = fixture();
  deps.publish = async (_v, _p, _w, record) => {
    for (const platform of ["youtube", "instagram", "facebook"] as const)
      await record({
        platform,
        state: "Published",
        id: platform,
        url: `https://example.org/${platform}`,
      });
  };
  const originalSave = deps.save;
  deps.save = async (p) => {
    if (p.status === "Completed") throw new Error("Sheet unavailable");
    await originalSave(p);
  };
  const result = await runWorkflow(deps);
  assert.ok("progress" in result);
  if (!("progress" in result)) throw new Error("Missing progress");
  assert.equal(result.state, "Completed");
  assert.equal(result.operationalSuccess, false);
  assert.equal(result.progress.finalization?.persistence, "failed");
  assert.equal(result.progress.finalization?.pause, "saved");
  assert.equal(
    result.progress.publications.filter((p) => p.state === "Published").length,
    3,
  );
});
