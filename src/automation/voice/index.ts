import { z } from "zod";
import { resolve } from "node:path";
import type { Config } from "../operations/config.js";
import type { ContentPlan, Narration, Workspace } from "../domain.js";
import { command, assertAudio } from "../operations/media.js";
import { twice } from "../operations/http.js";

export function validateNarrationDuration(duration: number) {
  if (duration < 35 || duration > 65)
    throw new Error(
      `Narration must end naturally within 35–65 seconds: ${duration.toFixed(1)}s`,
    );
}

export function createVoice(config: Config, signal: () => AbortSignal) {
  return (plan: ContentPlan, workspace: Workspace): Promise<Narration> =>
    twice(async () => {
      const raw = workspace.file("narration-raw.wav");
      const path = workspace.file("narration.wav");
      const engineOutput = await command(
        config.PYTHON_EXECUTABLE,
        [
          resolve(config.root, "voicebox/synthesize.py"),
          "--text",
          plan.narration,
          "--reference",
          resolve(config.root, "assets/Base-audio.mp3"),
          "--transcript",
          config.VOICEBOX_REFERENCE_TEXT,
          "--output",
          raw,
          "--model-size",
          config.VOICEBOX_MODEL_SIZE,
        ],
        signal(),
      );
      const engineMetrics = z
        .object({ peakRssMb: z.number().positive() })
        .parse(JSON.parse(engineOutput.trim().split("\n").at(-1) ?? "{}"));
      let info = await assertAudio(raw, signal());
      validateNarrationDuration(info.duration);
      await command(
        "ffmpeg",
        [
          "-y",
          "-i",
          raw,
          "-af",
          "loudnorm=I=-16:TP=-1.5:LRA=11",
          "-ar",
          "24000",
          path,
        ],
        signal(),
      );
      info = await assertAudio(path, signal());
      validateNarrationDuration(info.duration);
      return { path, ...info, peakRssMb: engineMetrics.peakRssMb };
    });
}
