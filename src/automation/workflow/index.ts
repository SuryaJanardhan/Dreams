import { randomUUID } from "node:crypto";
import type {
  CaptionTrack,
  ContentPlan,
  ResearchPacket,
  Narration,
  Outcome,
  Progress,
  Publication,
  PublicationJournal,
  PrimitiveSpec,
  Finalization,
  RenderedVideo,
  Task,
  ValidatedAsset,
  VisualPlan,
  Workspace,
} from "../domain.js";
import { initialPublications, message } from "../domain.js";
export interface WorkflowDependencies {
  preflight(): Promise<void>;
  intake(): Promise<
    | { kind: "paused"; detail: string }
    | { kind: "empty" }
    | { kind: "interrupted"; progress: Progress }
    | { kind: "task"; task: Task }
  >;
  save(progress: Progress): Promise<void>;
  pause(reason: string): Promise<void>;
  workspace(jobId: string): Promise<Workspace>;
  research(task: Task): Promise<ResearchPacket>;
  content(task: Task, research: ResearchPacket): Promise<ContentPlan>;
  promotedPrimitives(): Promise<PrimitiveSpec[]>;
  visualPlan(
    task: Task,
    content: ContentPlan,
    promotedPrimitives: PrimitiveSpec[],
  ): Promise<VisualPlan>;
  recordPrimitiveReviews(
    jobId: string,
    primitives: PrimitiveSpec[],
  ): Promise<string>;
  assets(
    task: Task,
    content: ContentPlan,
    visualPlan: VisualPlan,
    workspace: Workspace,
  ): Promise<ValidatedAsset[]>;
  voice(plan: ContentPlan, workspace: Workspace): Promise<Narration>;
  captions(plan: ContentPlan, narration: Narration): Promise<CaptionTrack>;
  render(
    plan: ContentPlan,
    visualPlan: VisualPlan,
    assets: ValidatedAsset[],
    narration: Narration,
    captions: CaptionTrack,
    workspace: Workspace,
  ): Promise<RenderedVideo>;
  quality(
    plan: ContentPlan,
    visualPlan: VisualPlan,
    assets: ValidatedAsset[],
    narration: Narration,
    captions: CaptionTrack,
    video: RenderedVideo,
    workspace: Workspace,
  ): Promise<RenderedVideo>;
  publish(
    video: RenderedVideo,
    plan: ContentPlan,
    workspace: Workspace,
    record: (result: Publication) => Promise<void>,
    journal: (snapshot: PublicationJournal) => Promise<void>,
  ): Promise<void>;
  cleanupStaging(): Promise<string[]>;
  notify(progress: Progress): Promise<void>;
  cancelled(): boolean;
  now(): Date;
}
/** Serial job lifecycle. Publication adapters report every attempted target, even after a target fails. */
export async function runWorkflow(
  deps: WorkflowDependencies,
): Promise<Outcome> {
  let progress: Progress | undefined;
  let workspace: Workspace | undefined;
  const touch = () => {
    if (progress) progress.updatedAt = deps.now().toISOString();
  };
  const save = async () => {
    touch();
    if (progress) await deps.save(progress);
  };
  const check = () => {
    if (deps.cancelled())
      throw new Error("Cancelled or production time budget exhausted");
  };
  try {
    await deps.preflight();
    const intake = await deps.intake();
    if (intake.kind === "paused")
      return { state: "Paused", detail: intake.detail };
    if (intake.kind === "empty")
      return { state: "NoWork", detail: "No eligible Not Posted task" };
    if (intake.kind === "interrupted") {
      progress = intake.progress;
      progress.status = "Interrupted";
      progress.remarks = `${progress.remarks} A previous run ended without finalization. No job was resumed.`;
    } else {
      progress = {
        jobId: randomUUID(),
        task: intake.task,
        status: "Processing",
        stage: "initialization",
        lastCompleted: null,
        startedAt: deps.now().toISOString(),
        updatedAt: deps.now().toISOString(),
        publications: initialPublications(),
        remarks: "",
        cleanup: [],
        grades: {},
        metrics: {},
        journal: { staging: null, operations: [] },
      };
      await save();
      workspace = await deps.workspace(progress.jobId);
      const job = progress;
      const work = workspace;
      const step = async <T>(
        stage: Progress["stage"],
        operation: () => Promise<T>,
      ): Promise<T> => {
        check();
        job.stage = stage;
        await save();
        const started = performance.now();
        const result = await operation();
        if (!job.metrics) job.metrics = {};
        job.metrics["orchestrator.peakRssMb"] = Math.round(
          process.resourceUsage().maxRSS / 1024,
        );
        job.metrics[`${stage}.seconds`] =
          Math.round((performance.now() - started) / 10) / 100;
        check();
        job.lastCompleted = stage;
        await save();
        return result;
      };
      const research = await step("research", () => deps.research(intake.task));
      progress.sources = research.sources;
      const plan = await step("content", () =>
        deps.content(intake.task, research),
      );
      progress.grades.content = plan.grade;
      const promotedPrimitives = await deps.promotedPrimitives();
      const visualPlan = await step("visual-planning", () =>
        deps.visualPlan(intake.task, plan, promotedPrimitives),
      );
      const trusted = new Set(promotedPrimitives.map((item) => item.id));
      const newPrimitives = visualPlan.proposedPrimitives.filter(
        (item) => !trusted.has(item.id),
      );
      progress.primitiveReviews = newPrimitives.map((item) => ({
        id: item.id,
        status: "pending",
        spec: item,
      }));
      if (newPrimitives.length)
        progress.primitiveReviewUrl = await deps.recordPrimitiveReviews(
          progress.jobId,
          newPrimitives,
        );
      const assets = await step("assets", () =>
        deps.assets(intake.task, plan, visualPlan, work),
      );
      const narration = await step("voice", () => deps.voice(plan, work));
      if (narration.peakRssMb)
        progress.metrics = {
          ...progress.metrics,
          "voice.peakRssMb": narration.peakRssMb,
        };
      const captions = await step("captions", () =>
        deps.captions(plan, narration),
      );
      const video = await step("rendering", () =>
        deps.render(plan, visualPlan, assets, narration, captions, work),
      );
      const checkedVideo = await step("quality", () =>
        deps.quality(
          plan,
          visualPlan,
          assets,
          narration,
          captions,
          video,
          work,
        ),
      );
      progress.grades.rendering = checkedVideo.grade;
      if (checkedVideo.checks)
        progress.metrics = { ...progress.metrics, ...checkedVideo.checks };
      await step("publishing", () =>
        deps.publish(
          checkedVideo,
          plan,
          work,
          async (result) => {
            if (!progress) throw new Error("Missing job progress");
            progress.publications = progress.publications.map((previous) =>
              previous.platform === result.platform ? result : previous,
            );
            await save();
          },
          async (snapshot) => {
            job.journal = structuredClone(snapshot);
            await save();
          },
        ),
      );
      const complete = progress.publications.every(
        (result) => result.state === "Published",
      );
      progress.status = complete
        ? "Completed"
        : progress.publications.some((result) => result.state === "Published")
          ? "Partial"
          : "Failed";
      progress.remarks = complete
        ? "All three platforms reported published/ready with canonical links."
        : "Publication attempts finished; at least one required target was not verified.";
    }
  } catch (error) {
    if (!progress) {
      // Configuration/intake failure still pauses where Sheets is available and gets an incident notification.
      const detail = message(error);
      await deps.pause(detail).catch(() => {});
      throw error;
    }
    progress.status = deps.cancelled() ? "Cancelled" : "Failed";
    if (
      progress.publications.some((result) => result.state === "Published") &&
      !deps.cancelled()
    )
      progress.status = "Partial";
    progress.remarks = `${progress.stage}: ${message(error)}`;
  }
  if (!progress) throw new Error("Workflow ended without a result");
  // Cleanup is a separate finalization phase; preserve the stage that failed for the incident report.
  const finalization: Finalization = {
    cleanup: "passed",
    persistence: "passed",
    pause: "not-required",
    notification: "pending",
  };
  progress.finalization = finalization;
  const finalizationErrors: string[] = [];
  for (const [label, cleanup] of [
    ["staging", () => deps.cleanupStaging()],
    [
      "workspace",
      () =>
        workspace
          ? workspace.cleanup()
          : Promise.resolve(["No workspace created"]),
    ],
  ] as const) {
    try {
      progress.cleanup.push(...(await cleanup()));
    } catch (error) {
      finalization.cleanup = "failed";
      finalizationErrors.push(`${label} cleanup failed: ${message(error)}`);
    }
  }
  if (finalizationErrors.length)
    progress.remarks += ` Cleanup Failed: ${finalizationErrors.join("; ")}`;
  const pause =
    progress.status !== "Completed" || finalizationErrors.length > 0;
  if (pause) {
    try {
      await deps.pause(progress.remarks);
      finalization.pause = "saved";
    } catch (error) {
      finalization.pause = "failed";
      progress.remarks += ` Could not persist PAUSED: ${message(error)}`;
    }
  }
  try {
    await save();
  } catch (error) {
    finalization.persistence = "failed";
    progress.remarks += ` Final Sheet update failed: ${message(error)}`;
    try {
      await deps.pause(progress.remarks);
      finalization.pause = "saved";
    } catch {
      finalization.pause = "failed";
    }
  }
  let notification = "sent";
  try {
    await deps.notify(progress);
    finalization.notification = "sent";
  } catch (error) {
    finalization.notification = "failed";
    notification = `failed: ${message(error)}`;
    progress.remarks += ` Notification ${notification}`;
  }
  try {
    await save();
  } catch (error) {
    finalization.persistence = "failed";
    progress.remarks += ` Notification-result Sheet update failed: ${message(error)}`;
    try {
      await deps.pause(progress.remarks);
      finalization.pause = "saved";
    } catch {
      finalization.pause = "failed";
    }
  }
  return {
    state: progress.status,
    progress,
    notification,
    operationalSuccess:
      progress.status === "Completed" &&
      finalization.cleanup === "passed" &&
      finalization.persistence === "passed" &&
      finalization.pause !== "failed",
  };
}
