import "dotenv/config";
import { appendFile } from "node:fs/promises";
import { loadConfig, redact } from "../operations/config.js";
import { Http } from "../operations/http.js";
import { createNotifier } from "../operations/email.js";
import { createWorkspace } from "../workspace/index.js";
import { Sheets } from "../sheets/index.js";
import { Publisher } from "../publishing/index.js";
import { ApprovalStore } from "./store.js";
import { runApprovalDecision } from "./decision.js";
import { message } from "../domain.js";

async function output(handled: boolean) {
  const path = process.env.GITHUB_OUTPUT;
  if (path) await appendFile(path, `handled=${handled}\n`, "utf8");
}

export async function main() {
  let secrets: string[] = [];
  try {
    const config = loadConfig();
    secrets = config.secrets;
    const controller = new AbortController();
    const http = new Http(() => controller.signal);
    const sheets = new Sheets(config, http);
    const notifier = createNotifier(process.env, secrets);
    const approvals = new ApprovalStore(config, http);
    const publisher = new Publisher(config, http);
    await sheets.prepare();
    await sheets.assertRunning();
    if (!process.env.APPROVAL_ID) {
      const expired = await approvals.expireOne();
      if (expired) {
        expired.progress.status = "ApprovalExpired";
        expired.progress.stage = "approval";
        expired.progress.lastCompleted = "approval";
        expired.progress.approval = expired.approval;
        expired.progress.remarks =
          "Review expired after 72 hours without a decision. No social upload was attempted.";
        expired.progress.cleanup.push("Expired approval preview removed");
        await sheets.save(expired.progress);
        await notifier.progress(expired.progress);
        await output(true);
        console.log(
          JSON.stringify({
            state: "ApprovalExpired",
            jobId: expired.progress.jobId,
          }),
        );
        return;
      }
      const reminded = await approvals.sendReminder((progress, request) =>
        notifier.review(progress, request),
      );
      if (reminded) {
        await output(true);
        console.log(JSON.stringify({ state: "ApprovalReminderSent" }));
        return;
      }
    }
    const result = await runApprovalDecision(
      {
        claim: (id) => approvals.claim(id),
        workspace: (jobId) => createWorkspace(config.root, jobId),
        download: (approval, workspace) =>
          approvals.download(approval, workspace),
        publish: (video, plan, workspace, record, journal) =>
          publisher.publish(video, plan, workspace, record, journal),
        save: (progress) => sheets.save(progress),
        finish: async (approval, status) => {
          const cleanup: string[] = [];
          const errors: string[] = [];
          for (const [label, operation] of [
            ["approval preview", () => approvals.finish(approval, status)],
            ["publication staging", () => publisher.cleanup()],
          ] as const) {
            try {
              cleanup.push(...(await operation()));
            } catch (error) {
              errors.push(`${label}: ${message(error)}`);
            }
          }
          if (errors.length)
            throw new Error(`Cleanup failed: ${errors.join("; ")}`);
          return cleanup;
        },
        pause: (reason) => sheets.pause(redact(reason, secrets)),
        notify: (progress) =>
          notifier.progress({
            ...progress,
            remarks: redact(progress.remarks, secrets),
          }),
        now: () => new Date(),
      },
      process.env.APPROVAL_ID || undefined,
    );
    const handled = result.state !== "NoDecision";
    await output(handled);
    if (result.state === "NoDecision") {
      console.log(JSON.stringify(result));
      return;
    }
    if (!("progress" in result))
      throw new Error(`Unexpected approval outcome ${result.state}`);
    console.log(
      JSON.stringify({
        state: result.state,
        jobId: result.progress.jobId,
        operationalSuccess: result.operationalSuccess,
      }),
    );
    if (!result.operationalSuccess && result.state !== "Rejected")
      process.exitCode = 1;
  } catch (error) {
    await output(false).catch(() => {});
    console.error(redact(message(error), secrets));
    process.exitCode = 1;
  }
}

if (require.main === module) void main();
