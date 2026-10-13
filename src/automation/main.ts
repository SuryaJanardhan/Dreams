import "dotenv/config";
import { resolve } from "node:path";
import { loadConfig, redact } from "./operations/config.js";
import { Http } from "./operations/http.js";
import { command, probe } from "./operations/media.js";
import { createNotifier } from "./operations/email.js";
import { createWorkspace, assertAsset } from "./workspace/index.js";
import { Sheets } from "./sheets/index.js";
import { Gemini, createContent } from "./content/index.js";
import { createVoice } from "./voice/index.js";
import { createCaptions } from "./captions/index.js";
import { renderVideo, sceneGenerator } from "./rendering/index.js";
import { Publisher } from "./publishing/index.js";
import { runWorkflow } from "./workflow/index.js";
import { message } from "./domain.js";
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
    const sheets = new Sheets(config, http);
    const gemini = new Gemini(http);
    const notifier = createNotifier(process.env, secrets);
    const publisher = new Publisher(config, http);
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
        for (const asset of ["Base-audio.mp3", "cover.png", "Bgm.m4a"])
          await assertAsset(resolve(config.root, "assets", asset));
        const reference = await probe(
          resolve(config.root, "assets/Base-audio.mp3"),
          signal(),
        );
        if (reference.format.duration < 2 || reference.format.duration > 30)
          throw new Error("Reference voice sample must be 2–30 seconds");
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
      content: createContent(config, gemini),
      voice: createVoice(config, signal),
      captions: createCaptions(config, http),
      render: (plan, narration, captions, workspace) =>
        renderVideo(plan, narration, captions, workspace, {
          config,
          signal: signal(),
          generator: sceneGenerator(config, gemini),
          log: (text) => console.log(redact(text, secrets)),
        }),
      publish: (video, plan, workspace, record, journal) =>
        publisher.publish(video, plan, workspace, record, journal),
      cleanupStaging: () => {
        finalize();
        return publisher.cleanup();
      },
      notify: (p) =>
        notifier.progress({ ...p, remarks: redact(p.remarks, secrets) }),
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
