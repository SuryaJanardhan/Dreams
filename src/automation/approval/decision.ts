import type {
  ApprovalPackage,
  ContentPlan,
  Outcome,
  Progress,
  Publication,
  PublicationJournal,
  RenderedVideo,
  Workspace,
} from "../domain.js";
import { message } from "../domain.js";

export interface ApprovalDecisionDependencies {
  claim(id?: string): Promise<ApprovalPackage | null>;
  workspace(jobId: string): Promise<Workspace>;
  download(
    approval: ApprovalPackage,
    workspace: Workspace,
  ): Promise<RenderedVideo>;
  publish(
    video: RenderedVideo,
    plan: ContentPlan,
    workspace: Workspace,
    record: (result: Publication) => Promise<void>,
    journal: (snapshot: PublicationJournal) => Promise<void>,
  ): Promise<void>;
  save(progress: Progress): Promise<void>;
  finish(
    approval: ApprovalPackage,
    status: "completed" | "failed" | "rejected",
  ): Promise<string[]>;
  pause(reason: string): Promise<void>;
  notify(progress: Progress): Promise<void>;
  now(): Date;
}

export type ApprovalDecisionOutcome = Outcome | { state: "NoDecision" };

/** The only orchestration path from a durable review decision to social APIs. */
export async function runApprovalDecision(
  deps: ApprovalDecisionDependencies,
  approvalId?: string,
): Promise<ApprovalDecisionOutcome> {
  const approval = await deps.claim(approvalId);
  if (!approval) return { state: "NoDecision" };
  const progress = structuredClone(approval.progress);
  progress.approval = {
    id: approval.id,
    status: approval.status,
    previewKey: approval.previewKey,
    expiresAt: approval.expiresAt,
  };
  progress.updatedAt = deps.now().toISOString();
  if (approval.status === "rejected") {
    progress.status = "Rejected";
    progress.stage = "approval";
    progress.lastCompleted = "approval";
    progress.remarks =
      "Publishing rejected from the secure review page. No social upload was attempted.";
    progress.cleanup.push(...(await deps.finish(approval, "rejected")));
    await deps.save(progress);
    await deps.notify(progress);
    return {
      state: "Rejected",
      progress,
      notification: "sent",
      operationalSuccess: true,
    };
  }

  const workspace = await deps.workspace(progress.jobId);
  let finishStatus: "completed" | "failed" = "failed";
  try {
    progress.status = "Processing";
    progress.stage = "publishing";
    progress.remarks = "Approved; publishing to all required platforms.";
    await deps.save(progress);
    const video = await deps.download(approval, workspace);
    await deps.publish(
      video,
      approval.plan,
      workspace,
      async (result) => {
        progress.publications = progress.publications.map((previous) =>
          previous.platform === result.platform ? result : previous,
        );
        progress.updatedAt = deps.now().toISOString();
        await deps.save(progress);
      },
      async (journal) => {
        progress.journal = structuredClone(journal);
        await deps.save(progress);
      },
    );
    const complete = progress.publications.every(
      (result) => result.state === "Published",
    );
    progress.status = complete
      ? "Completed"
      : progress.publications.some((result) => result.state === "Published")
        ? "Partial"
        : "Failed";
    progress.lastCompleted = "publishing";
    progress.remarks = complete
      ? "Approved video published and verified on all three platforms."
      : "Approved publication attempts finished without three verified links.";
    finishStatus = complete ? "completed" : "failed";
  } catch (error) {
    progress.status = progress.publications.some(
      (result) => result.state === "Published",
    )
      ? "Partial"
      : "Failed";
    progress.remarks = `Approved publishing failed: ${message(error)}`;
  }

  try {
    progress.cleanup.push(...(await deps.finish(approval, finishStatus)));
    progress.cleanup.push(...(await workspace.cleanup()));
  } catch (error) {
    progress.remarks += ` Cleanup failed: ${message(error)}`;
    finishStatus = "failed";
  }
  if (progress.status !== "Completed" || finishStatus === "failed")
    await deps.pause(progress.remarks);
  await deps.save(progress);
  let notification = "sent";
  try {
    await deps.notify(progress);
  } catch (error) {
    notification = `failed: ${message(error)}`;
  }
  return {
    state: progress.status,
    progress,
    notification,
    operationalSuccess:
      progress.status === "Completed" && finishStatus === "completed",
  };
}
