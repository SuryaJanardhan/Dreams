import "dotenv/config";
import { loadConfig, redact } from "./operations/config.js";
import { Http } from "./operations/http.js";
import { createNotifier } from "./operations/email.js";
import { Sheets } from "./sheets/index.js";

// In-job reporting only: invoked when a setup step fails before the production entry point.
async function reportSetupFailure() {
  const reason =
    "Actions dependency/setup validation failed before production started. Inspect the failed step in the Actions run.";
  let secrets: string[] = [];
  try {
    const config = loadConfig();
    secrets = config.secrets;
    const sheets = new Sheets(
      config,
      new Http(() => AbortSignal.timeout(60000)),
    );
    await sheets.prepare();
    await sheets.pause(reason);
  } catch (error) {
    console.error(
      redact(
        `Setup failure pause could not be saved: ${String(error)}`,
        secrets,
      ),
    );
  }
  await createNotifier(process.env, secrets).incident(reason);
}
void reportSetupFailure().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
