import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { probe } from "../automation/operations/media.js";
import { renderMock } from "./rendering.js";
import { buildMockTimeline, parseVtt, splitCaptionCues } from "./timing.js";

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
  const outputDirectory = resolve(root, "temp-difference");
  const audio = await probe(audioPath, AbortSignal.timeout(30000));
  const cues = splitCaptionCues(parseVtt(await readFile(captionsPath, "utf8")));
  const scenes = buildMockTimeline(cues, audio.format.duration);
  const result = await renderMock(root, audioPath, scenes, outputDirectory);
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
