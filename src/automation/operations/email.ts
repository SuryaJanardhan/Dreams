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
  const send = async (subject: string, text: string, html?: string) => {
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
          ...(html ? { html: redact(html, secrets, 30000) } : {}),
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
      const sources = (progress.sources ?? [])
        .map((source) => `${source.title}: ${source.url}`)
        .join("\n");
      const reviews = progress.primitiveReviews ?? [];
      const reviewText = reviews.length
        ? `New visual primitives awaiting review: ${reviews.map((review) => review.id).join(", ")}\n${progress.primitiveReviewUrl ?? "PrimitiveReview Sheet tab"}`
        : "";
      const escape = (value: string) =>
        value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      const colors = {
        structure: "#151515",
        active: "#2878d0",
        success: "#3f8f62",
        warning: "#e7c536",
        failure: "#cf4e46",
      } as const;
      const previews = reviews
        .map((review) => {
          const shapes = review.spec.shapes
            .map((shape) => {
              const color = colors[shape.semantic];
              if (shape.kind === "text")
                return `<text x="${shape.x}" y="${shape.y}" fill="${color}" font-size="9">${escape(shape.text ?? "")}</text>`;
              if (shape.kind === "line")
                return `<line x1="${shape.x}" y1="${shape.y}" x2="${shape.x + (shape.width ?? 10)}" y2="${shape.y + (shape.height ?? 0)}" stroke="${color}" stroke-width="3"/>`;
              if (shape.kind === "circle")
                return `<circle cx="${shape.x}" cy="${shape.y}" r="${(shape.width ?? 10) / 2}" fill="none" stroke="${color}" stroke-width="3"/>`;
              if (shape.kind === "path")
                return `<path d="${escape(shape.text ?? "")}" fill="none" stroke="${color}" stroke-width="3"/>`;
              return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width ?? 10}" height="${shape.height ?? 10}" fill="none" stroke="${color}" stroke-width="3"/>`;
            })
            .join("");
          return `<div style="display:inline-block;width:260px;margin:8px;padding:12px;border:1px solid #ddd"><strong>${escape(review.spec.label)}</strong><svg viewBox="0 0 100 100" style="display:block;width:230px;height:180px;background:#fff">${shapes}</svg><code>${escape(review.id)}</code></div>`;
        })
        .join("");
      const reviewHtml = reviews.length
        ? `<h3>New visual primitives</h3><p>These were validated and used for this video. They remain job-only until you approve reuse.</p>${previews}<p><a href="${escape(progress.primitiveReviewUrl ?? `https://docs.google.com/spreadsheets/d/${env.GOOGLE_SHEET_ID ?? ""}`)}" style="display:inline-block;padding:12px 18px;background:#2878d0;color:white;text-decoration:none;border-radius:6px">Open review and tick Promote</a></p>`
        : "";
      const subject = `Dreams: ${progress.status} — ${progress.task.idea.slice(0, 80)}`;
      const text = [
        `Task: ${progress.task.id}; Job: ${progress.jobId}`,
        `Status: ${progress.status}`,
        `Stage: ${progress.stage}; last completed: ${progress.lastCompleted ?? "none"}`,
        `Structural grades: ${JSON.stringify(progress.grades)}`,
        `Stage/quality measurements: ${JSON.stringify(progress.metrics ?? {})}`,
        `Sources:\n${sources || "Gemini best-effort; no source links returned"}`,
        reviewText,
        `Operational finalization: ${JSON.stringify(progress.finalization ?? {})}`,
        `Publication/staging journal: ${JSON.stringify(progress.journal ?? {})}`,
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
      ]
        .filter(Boolean)
        .join("\n\n");
      await send(
        subject,
        text,
        `<div style="font-family:Arial,sans-serif;color:#151515"><h2>${escape(subject)}</h2><pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${escape(text)}</pre>${reviewHtml}</div>`,
      );
    },
    incident: (error: unknown) =>
      send(
        "Dreams: setup/control failure",
        `No new production should proceed. ${message(error)}\nInspect Actions logs and AutomationControl before re-enabling processing.`,
      ),
  };
}
