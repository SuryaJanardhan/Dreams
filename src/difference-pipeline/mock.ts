import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { probe } from "../automation/operations/media.js";
import { renderMock } from "./rendering.js";
import { buildMockTimeline, parseVtt, splitCaptionCues } from "./timing.js";
import { validateComparisonRetention } from "./quality.js";

async function main() {
  const root = process.cwd();
  const audioPath = resolve(
    process.argv[2] ??
      "assets/difference-pipeline/mock/browser-vs-search-engine.mp3",
  );
  const captionsPath = resolve(
    process.argv[3] ??
      "assets/difference-pipeline/mock/browser-vs-search-engine.vtt",
  );
  const wordsPath = resolve(
    process.argv[4] ??
      "assets/difference-pipeline/mock/browser-vs-search-engine.words.json",
  );
  const outputDirectory = resolve(root, "temp-difference");
  const audio = await probe(audioPath, AbortSignal.timeout(30000));
  const value: unknown = JSON.parse(await readFile(wordsPath, "utf8"));
  const words = z
    .array(
      z.object({
        text: z.string().min(1),
        start: z.number().nonnegative(),
        end: z.number().positive(),
      }),
    )
    .parse(value);
  const cues = splitCaptionCues(
    parseVtt(await readFile(captionsPath, "utf8")),
    words,
  );
  const scenes = buildMockTimeline(cues, audio.format.duration);
  validateComparisonRetention("Browser", "Search Engine", scenes);
  const result = await renderMock(root, audioPath, scenes, outputDirectory);
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
