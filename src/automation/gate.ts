import "dotenv/config";
import { appendFile } from "node:fs/promises";
import { loadSheetsConfig, redact } from "./operations/config.js";
import { Http } from "./operations/http.js";
import { Sheets } from "./sheets/index.js";
import { createNotifier } from "./operations/email.js";
export async function gate() {
  const config = loadSheetsConfig();
  const sheets = new Sheets(config, new Http(() => AbortSignal.timeout(60000)));
  await sheets.prepare();
  const intake = await sheets.intake();
  if (intake.kind === "interrupted") {
    const progress = intake.progress;
    progress.status = "Interrupted";
    progress.updatedAt = new Date().toISOString();
    progress.remarks = `${progress.remarks} Previous run was interrupted. No stage resumed and no upload retried. Inspect saved publication journal and any retained staging before clearing PAUSED.`;
    await sheets.pause(progress.remarks);
    await sheets.save(progress);
    const secrets = [
      config.credentials.private_key,
      process.env.EMAIL_APP_PASSWORD ?? "",
    ];
    try {
      await createNotifier(process.env, secrets).progress(progress);
    } catch (error) {
      progress.remarks += ` Notification failed: ${redact(String(error), secrets)}`;
      await sheets.save(progress);
    }
  }
  const ready = intake.kind === "task";
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `ready=${ready}
`,
    );
  console.log(
    ready
      ? "Eligible task found; full preflight will recheck and claim it."
      : `No production: ${intake.kind}`,
  );
  return ready;
}
if (require.main === module)
  void gate().catch((error) => {
    console.error(String(error));
    process.exitCode = 1;
  });
