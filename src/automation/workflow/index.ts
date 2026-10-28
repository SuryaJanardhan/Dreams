import { randomUUID } from "node:crypto";
import type {
  CaptionTrack,
  ContentPlan,
  ApprovalSummary,
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
  prepareApproval(
    video: RenderedVideo,
    plan: ContentPlan,
    progress: Progress,
  ): Promise<ApprovalHandoff>;
  cleanupStaging(): Promise<string[]>;
  notify(progress: Progress): Promise<void>;
  cancelled(): boolean;
  now(): Date;
}
export interface ApprovalHandoff {
  summary: ApprovalSummary;
  deliver(): Promise<void>;
  revoke(): Promise<void>;
}
/** Serial job lifecycle. Publication adapters report every attempted target, even after a target fails. */
export async function runWorkflow(
  deps: WorkflowDependencies,
): Promise<Outcome> {
  let progress: Progress | undefined;
  let workspace: Workspace | undefined;
  let approvalHandoff: ApprovalHandoff | undefined;
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
      approvalHandoff = await step("approval", () =>
        deps.prepareApproval(checkedVideo, plan, job),
      );
      progress.approval = approvalHandoff.summary;
      progress.status = "AwaitingApproval";
      progress.publications = initialPublications().map((publication) => ({
        ...publication,
        detail: "Secure review approval is required before publishing",
      }));
      progress.remarks =
        "Video generated, quality-checked and emailed for review. No social upload has been attempted.";
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
  if (progress.status === "AwaitingApproval" && finalizationErrors.length > 0) {
    await approvalHandoff?.revoke().catch((error) => {
      progress!.remarks += ` Approval revocation failed: ${message(error)}`;
    });
    progress.status = "Failed";
    progress.remarks +=
      " Review access was revoked because finalization did not complete safely.";
  }
  const pause =
    !["Completed", "AwaitingApproval", "Rejected"].includes(progress.status) ||
    finalizationErrors.length > 0;
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
    if (progress.status === "AwaitingApproval") {
      await approvalHandoff?.revoke().catch((revokeError) => {
        progress!.remarks += ` Approval revocation failed: ${message(revokeError)}`;
      });
      progress.status = "Failed";
      progress.remarks +=
        " Review access was revoked because AwaitingApproval could not be persisted.";
    }
    try {
      await deps.pause(progress.remarks);
      finalization.pause = "saved";
    } catch {
      finalization.pause = "failed";
    }
  }
  let notification = "sent";
  if (progress.status === "AwaitingApproval") {
    try {
      await approvalHandoff?.deliver();
      finalization.notification = "sent";
      progress.remarks =
        "Video generated, quality-checked and emailed for review. No social upload has been attempted.";
    } catch (error) {
      finalization.notification = "failed";
      notification = `failed: ${message(error)}`;
      progress.remarks += ` Review notification ${notification}`;
      await approvalHandoff?.revoke().catch((revokeError) => {
        progress!.remarks += ` Approval revocation failed: ${message(revokeError)}`;
      });
      progress.status = "Failed";
      try {
        await deps.pause(progress.remarks);
        finalization.pause = "saved";
      } catch {
        finalization.pause = "failed";
      }
    }
  } else {
    try {
      await deps.notify(progress);
      finalization.notification = "sent";
    } catch (error) {
      finalization.notification = "failed";
      notification = `failed: ${message(error)}`;
      progress.remarks += ` Notification ${notification}`;
    }
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
      ["Completed", "AwaitingApproval", "Rejected"].includes(progress.status) &&
      finalization.cleanup === "passed" &&
      finalization.persistence === "passed" &&
      finalization.pause !== "failed",
  };
}
