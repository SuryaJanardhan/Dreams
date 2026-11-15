import "dotenv/config";
import { resolve } from "node:path";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { loadConfig, redact } from "./operations/config.js";
import { Http } from "./operations/http.js";
import { Groq } from "./ai/groq.js";
import { LocalFallbackGenerator } from "./ai/local-fallback.js";
import { command, probe } from "./operations/media.js";
import { createNotifier } from "./operations/email.js";
import { createWorkspace, assertAsset } from "./workspace/index.js";
import { Sheets } from "./sheets/index.js";
import { createContent } from "./content/index.js";
import { createResearch } from "./research/index.js";
import {
  completeVisualPlanActions,
  createVisualPlan,
  parsePrimitiveSpec,
  repairVisualPlan,
  validateVisualPlan,
} from "./visual-planning/index.js";
import { createAssets } from "./assets/index.js";
import { writePrimitiveReviewArtifacts } from "./primitives/index.js";
import { createVoice, validateNarrationDuration } from "./voice/index.js";
import { assertAudio } from "./operations/media.js";
import { createCaptions } from "./captions/index.js";
import { renderVideo } from "./rendering/index.js";
import { createVisualQuality, VisualQualityError } from "./quality/index.js";
import { ApprovalStore } from "./approval/store.js";
import { runWorkflow } from "./workflow/index.js";
import { message } from "./domain.js";
import type { Task, Progress, PrimitiveSpec, ContentPlan, VisualPlan } from "./domain.js";

function localFixtureSheets(root: string) {
  const outputDir = process.env.LOCAL_OUTPUT_DIR || resolve(root, "output");
  const task: Task = {
    id: "local-fixture-task",
    row: 2,
    idea: "JWT authentication vs server-side sessions",
    description: "Compare state, revocation, scaling, and tradeoffs for backend engineers.",
    narration: "",
    type: "comparison",
    audience: "Backend engineers and interview candidates",
    sourceUrls: [],
  };
  const save = async (progress: Progress) => {
    await mkdir(outputDir, { recursive: true });
    await writeFile(resolve(outputDir, "progress.json"), JSON.stringify(progress, null, 2), "utf8");
  };
  return {
    prepare: async () => {},
    intake: async () => ({ kind: "task" as const, task }),
    save,
    pause: async (reason: string) => {
      await mkdir(outputDir, { recursive: true });
      await writeFile(resolve(outputDir, "paused.json"), JSON.stringify({ reason }, null, 2), "utf8");
    },
    promotedPrimitives: async () => [] as PrimitiveSpec[],
    recordPrimitiveReviews: async () => "output/primitive-reviews",
  };
}

function localFixtureVisualPlan(content: ContentPlan): VisualPlan {
  const world: VisualPlan["world"] = [
    { id: "jwt-token", kind: "token", label: "JWT", detail: "Signed claim travels with each request", semantic: "active", box: { x: 70, y: 190, width: 340, height: 250 } },
    { id: "api-cluster", kind: "server-cluster", label: "API servers", detail: "Verify token locally", semantic: "structure", box: { x: 500, y: 190, width: 330, height: 250 } },
    { id: "session-store", kind: "database", label: "Session store", detail: "Login state lives here", semantic: "success", box: { x: 290, y: 520, width: 340, height: 250 } },
    { id: "decision-table", kind: "table", label: "Choose by tradeoff", semantic: "structure", box: { x: 80, y: 850, width: 740, height: 300 }, rows: [["JWT", "Scale out; expiry-based revocation"], ["Session", "Shared state; immediate revocation"]] },
  ];
  const timeline: VisualPlan["timeline"] = [];
  let visible = ["jwt-token", "api-cluster"];
  for (const [index, beat] of content.beats.entries()) {
    const anchor = beat.text.trim().split(/\s+/).slice(0, 6).join(" ").slice(0, 60);
    if (index === 0) timeline.push({ id: "fixture-intro", beatId: beat.id, action: "reveal", objectIds: visible, anchor, motion: "soft-enter" });
    else if (index === 1) timeline.push({ id: "fixture-jwt-transfer", beatId: beat.id, action: "transfer", objectIds: ["jwt-token", "api-cluster"], anchor, motion: "travel-path" });
    else if (index === 2) timeline.push({ id: "fixture-expiry", beatId: beat.id, action: "expire", objectIds: ["jwt-token"], anchor, motion: "state-change" });
    else if (index === 3) {
      visible = [...visible, "session-store"];
      timeline.push({ id: "fixture-session", beatId: beat.id, action: "reveal", objectIds: ["session-store"], anchor, motion: "soft-enter" });
    } else if (index === 4) {
      timeline.push({ id: "fixture-clear", beatId: beat.id, action: "remove", objectIds: visible, anchor, motion: "soft-exit" });
      visible = ["decision-table"];
      timeline.push({ id: "fixture-decision", beatId: beat.id, action: "reveal", objectIds: visible, anchor, motion: "rearrange" });
    } else timeline.push({ id: `fixture-hold-${index}`, beatId: beat.id, action: "focus", objectIds: ["decision-table"], anchor, motion: "focus" });
  }
  const candidate: VisualPlan = { version: 2, world, timeline, camera: [], assetIntents: [], proposedPrimitives: [] };
  return validateVisualPlan(completeVisualPlanActions(candidate, content), content);
}
export async function main() {
  let secrets: string[] = [];
  let finalizing = false;
  let cancelledByUser = false;
  const production = new AbortController();
  const finalizeController = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const cancel = () => {
    cancelledByUser = true;
    production.abort(new Error("Cancellation requested"));
  };
  process.once("SIGTERM", cancel);
  process.once("SIGINT", cancel);
  const initialNotifier = createNotifier(process.env, secrets);
  try {
    const config = loadConfig();
    secrets = config.secrets;
    const recordedStart = Number(process.env.AUTOMATION_STARTED_AT_MS);
    const elapsed =
      Number.isFinite(recordedStart) && recordedStart > 0
        ? Math.max(0, Date.now() - recordedStart)
        : 0;
    timer = setTimeout(
      () =>
        production.abort(
          new Error(
            "Production budget exhausted; finalization reserve reached",
          ),
        ),
      Math.max(1, (config.AUTOMATION_BUDGET_MINUTES - 10) * 60000 - elapsed),
    );
    timer.unref();
    const signal = () =>
      finalizing ? finalizeController.signal : production.signal;
    const http = new Http(signal);
    const localMode = process.env.LOCAL_FIXTURE_MODE === "true";
    const localOutputDir = process.env.LOCAL_OUTPUT_DIR || resolve(config.root, "output");
    const sheets = localMode ? localFixtureSheets(config.root) : new Sheets(config, http);
    const provider = new Groq(
      { keys: config.GROQ_API_KEYS, model: config.GROQ_MODEL },
      http,
    );
    const groq = process.env.LOCAL_AI_FALLBACK === "true"
      ? new LocalFallbackGenerator(provider, config.root, signal)
      : provider;
    const notifier = createNotifier(process.env, secrets);
    const approvalStore = new ApprovalStore(config, http);
    const finalize = () => {
      if (!finalizing) {
        finalizing = true;
        setTimeout(
          () =>
            finalizeController.abort(
              new Error("Finalization budget exhausted"),
            ),
          9 * 60000,
        ).unref();
      }
    };
    const result = await runWorkflow({
      async preflight() {
        for (const asset of ["Base-audio.mp3", "Bgm.m4a"])
          await assertAsset(resolve(config.root, "assets", asset));
        const reference = await probe(
          resolve(config.root, "assets/Base-audio.mp3"),
          signal(),
        );
        if (reference.format.duration < 2 || reference.format.duration > 30)
          throw new Error("Reference voice sample must be 2–30 seconds");
        if (!localMode)
          await command(
            config.PYTHON_EXECUTABLE,
            [
              "-c",
              'import torch, qwen_tts, soundfile; print("Voice engine ready")',
            ],
            signal(),
          );
        await sheets.prepare();
      },
      intake: () => sheets.intake(),
      save: (p) => sheets.save(p),
      pause: (reason) => {
        finalize();
        return sheets.pause(redact(reason, secrets));
      },
      workspace: (id) => createWorkspace(config.root, id),
      research: createResearch(groq),
      content: createContent(groq),
      promotedPrimitives: () => sheets.promotedPrimitives(parsePrimitiveSpec),
      visualPlan: localMode
        ? async (_task, plan) => localFixtureVisualPlan(plan)
        : createVisualPlan(groq),
      recordPrimitiveReviews: async (jobId, specs) => {
        await writePrimitiveReviewArtifacts(config.root, jobId, specs);
        const artifactUrl = process.env.GITHUB_RUN_ID
          ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}#artifacts`
          : undefined;
        return sheets.recordPrimitiveReviews(jobId, specs, artifactUrl);
      },
      assets: createAssets(config, http, groq, groq),
      voice: localMode
        ? async (plan, workspace) => {
            const path = workspace.file("local-narration.wav");
            await command(
              "espeak",
              ["-v", "en", "-s", "148", "-p", "38", "-a", "175", "-w", path, plan.narration],
              signal(),
            );
            const info = await assertAudio(path, signal());
            validateNarrationDuration(info.duration);
            return { path, ...info };
          }
        : createVoice(config, signal),
      captions: createCaptions(config, http),
      render: (plan, visualPlan, assets, narration, captions, workspace) =>
        renderVideo(plan, visualPlan, narration, captions, workspace, {
          config,
          signal: signal(),
          assets,
          log: (text) => console.log(redact(text, secrets)),
        }),
      quality: async (
        plan,
        visualPlan,
        assets,
        narration,
        captions,
        video,
        workspace,
      ) => {
        if (localMode) {
          await mkdir(localOutputDir, { recursive: true });
          await copyFile(video.path, resolve(localOutputDir, "final.mp4"));
          return video;
        }
        const review = createVisualQuality(groq, signal);
        try {
          await review(plan, visualPlan, video, workspace);
          return video;
        } catch (error) {
          const repaired = await repairVisualPlan(
            groq,
            plan,
            visualPlan,
            error instanceof Error ? error.message : String(error),
            error instanceof VisualQualityError
              ? {
                  beatIds: [
                    ...new Set(error.issues.map((issue) => issue.beatId)),
                  ],
                  objectIds: [
                    ...new Set(
                      error.issues.flatMap((issue) =>
                        issue.objectId ? [issue.objectId] : [],
                      ),
                    ),
                  ],
                }
              : undefined,
          );
          const rerendered = await renderVideo(
            plan,
            repaired,
            narration,
            captions,
            workspace,
            {
              config,
              signal: signal(),
              assets,
              log: (text) => console.log(redact(text, secrets)),
            },
          );
          await review(plan, repaired, rerendered, workspace);
          return rerendered;
        }
      },
      prepareApproval: async (video, plan, progress) => {
        if (localMode) {
          await mkdir(localOutputDir, { recursive: true });
          await copyFile(video.path, resolve(localOutputDir, "final.mp4"));
          await writeFile(resolve(localOutputDir, "final-video.json"), JSON.stringify(video, null, 2), "utf8");
          return {
            summary: {
              id: "local-fixture-approval",
              status: "pending" as const,
              previewKey: video.path,
              expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
            },
            deliver: async () => {},
            revoke: async () => {},
          };
        }
        const request = await approvalStore.prepare(video, plan, progress);
        return {
          summary: request.approval,
          deliver: () => notifier.review(progress, request),
          revoke: () => approvalStore.revoke(request.approval),
        };
      },
      cleanupStaging: async () => {
        finalize();
        return ["No social publication staging created before approval"];
      },
      notify: (p) =>
        localMode
          ? Promise.resolve()
          : notifier.progress({ ...p, remarks: redact(p.remarks, secrets) }),
      cancelled: () => cancelledByUser,
      now: () => new Date(),
    });
    console.log(
      JSON.stringify(
        !("progress" in result)
          ? result
          : {
              state: result.state,
              jobId: result.progress.jobId,
              remarks: redact(result.progress.remarks, secrets),
              notification: result.notification,
              finalization: result.progress.finalization,
              metrics: result.progress.metrics,
            },
      ),
    );
    if ("progress" in result)
      process.exitCode = result.operationalSuccess ? 0 : 1;
  } catch (error) {
    console.error(redact(message(error), secrets));
    await initialNotifier
      .incident(redact(message(error), secrets))
      .catch((emailError) =>
        console.error(
          `Incident email failed: ${redact(message(emailError), secrets)}`,
        ),
      );
    process.exitCode = 1;
  } finally {
    if (timer) clearTimeout(timer);
    process.removeListener("SIGTERM", cancel);
    process.removeListener("SIGINT", cancel);
  }
}
if (require.main === module) void main();
