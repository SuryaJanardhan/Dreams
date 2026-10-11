import nodemailer from "nodemailer";
import type { Progress } from "../domain.js";
import { message } from "../domain.js";
import { redact } from "./config.js";
export function createNotifier(
  env: NodeJS.ProcessEnv,
  secrets: readonly string[],
) {
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: env.EMAIL_USER, pass: env.EMAIL_APP_PASSWORD },
    connectionTimeout: 20000,
    socketTimeout: 30000,
  });
  const send = async (subject: string, text: string) => {
    if (!env.EMAIL_USER || !env.EMAIL_APP_PASSWORD || !env.NOTIFICATION_EMAIL)
      throw new Error("Email credentials/recipient missing");
    let error = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await transport.sendMail({
          from: env.EMAIL_USER,
          to: env.NOTIFICATION_EMAIL,
          subject,
          text: redact(text, secrets),
        });
        return;
      } catch (cause) {
        error = message(cause);
      }
    }
    throw new Error(redact(error, secrets));
  };
  return {
    async progress(progress: Progress) {
      const links = progress.publications
        .map(
          (result) =>
            `${result.platform}: ${result.state}${result.state === "Published" ? ` — ${result.url}` : ` — ${result.detail}${result.id ? ` (provider ID: ${result.id})` : ""}${result.url ? ` — ${result.url}` : ""}`}`,
        )
        .join("\n");
      await send(
        `Dreams: ${progress.status} — ${progress.task.idea.slice(0, 80)}`,
        [
          `Task: ${progress.task.id}; Job: ${progress.jobId}`,
          `Status: ${progress.status}`,
          `Stage: ${progress.stage}; last completed: ${progress.lastCompleted ?? "none"}`,
          `Grades: ${JSON.stringify(progress.grades)}`,
          progress.remarks,
          links,
          `Cleanup: ${progress.cleanup.join("; ") || "No cleanup confirmation"}`,
          `Sheet: https://docs.google.com/spreadsheets/d/${env.GOOGLE_SHEET_ID ?? ""}`,
          env.GITHUB_RUN_ID
            ? `Actions: https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
            : "",
          progress.status === "Completed"
            ? "All three publications verified."
            : "Production is paused where the Sheet control write succeeded. Fix the incident, then clear PAUSED. No automatic retry will publish this task.",
        ].join("\n\n"),
      );
    },
    incident: (error: unknown) =>
      send(
        "Dreams: setup/control failure",
        `No new production should proceed. ${message(error)}\nInspect Actions logs and AutomationControl before re-enabling processing.`,
      ),
  };
}
