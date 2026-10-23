import { mkdir, rm, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  CaptionTrack,
  ContentPlan,
  VisualPlan,
  Workspace,
} from "../src/automation/domain.js";
import { command } from "../src/automation/operations/media.js";
import { renderVideo } from "../src/automation/rendering/index.js";

async function main() {
  const root = process.cwd();
  const previewRoot = resolve(root, "previews");
  const work = resolve(previewRoot, "continuous-work");
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const workspace: Workspace = {
    path: work,
    file: (name) => resolve(work, name),
    cleanup: async () => [],
  };
  const narrationText =
    "Browser sends a request. The API validates it. Then the database stores a new row safely.";
  const content: ContentPlan = {
    type: "scenario",
    title: "How an API stores data",
    narration: narrationText,
    beats: [
      {
        id: "request",
        text: "Browser sends a request.",
        purpose: "Show the request leaving the browser",
      },
      {
        id: "validation",
        text: "The API validates it.",
        purpose: "Show API validation",
      },
      {
        id: "storage",
        text: "Then the database stores a new row safely.",
        purpose: "Show the validated row reaching storage",
      },
    ],
    copies: {
      youtube: { title: "How an API stores data", description: "Preview" },
      instagram: { title: "How an API stores data", description: "Preview" },
      facebook: { title: "How an API stores data", description: "Preview" },
    },
    research: { mode: "gemini-best-effort", summary: "Preview", sources: [] },
    grade: 100,
  };
  const story: VisualPlan = {
    version: 2,
    world: [
      {
        id: "browser",
        kind: "browser",
        label: "Browser",
        semantic: "active",
        box: { x: 40, y: 310, width: 250, height: 210 },
      },
      {
        id: "api",
        kind: "api",
        label: "API",
        semantic: "warning",
        box: { x: 330, y: 310, width: 240, height: 210 },
      },
      {
        id: "database",
        kind: "database",
        label: "Database",
        semantic: "structure",
        box: { x: 620, y: 310, width: 240, height: 230 },
      },
    ],
    timeline: [
      {
        id: "draw-browser",
        beatId: "request",
        action: "create",
        objectIds: ["browser"],
        anchor: "Browser",
        motion: "soft-enter",
      },
      {
        id: "draw-api",
        beatId: "request",
        action: "create",
        objectIds: ["api"],
        anchor: "sends",
        motion: "soft-enter",
      },
      {
        id: "send-request",
        beatId: "request",
        action: "transfer",
        objectIds: ["browser", "api"],
        anchor: "request",
        motion: "travel-path",
      },
      {
        id: "focus-api",
        beatId: "validation",
        action: "focus",
        objectIds: ["api"],
        anchor: "API",
        motion: "focus",
      },
      {
        id: "validate-api",
        beatId: "validation",
        action: "succeed",
        objectIds: ["api"],
        anchor: "validates",
        motion: "state-change",
      },
      {
        id: "draw-database",
        beatId: "storage",
        action: "create",
        objectIds: ["database"],
        anchor: "Then",
        motion: "soft-enter",
      },
      {
        id: "connect-database",
        beatId: "storage",
        action: "draw",
        objectIds: ["api", "database"],
        anchor: "database",
        motion: "draw-path",
      },
      {
        id: "store-row",
        beatId: "storage",
        action: "row-insert",
        objectIds: ["database"],
        anchor: "stores",
        motion: "internal-action",
      },
      {
        id: "settle-world",
        beatId: "storage",
        action: "settle",
        objectIds: ["browser", "api", "database"],
        anchor: "safely",
        motion: "settle",
      },
    ],
    camera: [
      {
        id: "camera-api",
        beatId: "validation",
        action: "push-in",
        objectIds: ["api"],
        anchor: "API",
        zoom: 1.1,
      },
      {
        id: "camera-wide",
        beatId: "storage",
        action: "return-wide",
        objectIds: ["browser", "api"],
        anchor: "Then",
        zoom: 1,
      },
    ],
    assetIntents: [],
    proposedPrimitives: [],
  };
  const rawWords = narrationText.split(/\s+/);
  const secondsPerWord = 0.38;
  const words = rawWords.map((text, index) => ({
    text,
    start: index * secondsPerWord,
    end: (index + 1) * secondsPerWord - 0.03,
  }));
  const duration = rawWords.length * secondsPerWord;
  const track: CaptionTrack = {
    words,
    duration,
    beats: [
      { ...content.beats[0]!, start: words[0]!.start, end: words[3]!.end },
      { ...content.beats[1]!, start: words[4]!.start, end: words[7]!.end },
      {
        ...content.beats[2]!,
        start: words[8]!.start,
        end: words.at(-1)!.end,
      },
    ],
  };
  const signal = AbortSignal.timeout(180_000);
  const audio = workspace.file("preview.wav");
  await command(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=230:sample_rate=24000",
      "-t",
      String(duration),
      audio,
    ],
    signal,
  );
  const result = await renderVideo(
    content,
    story,
    { path: audio, duration, sampleRate: 24000 },
    track,
    workspace,
    {
      config: { root },
      signal,
      log: console.log,
    },
  );
  const output = resolve(previewRoot, "continuous-visual.mp4");
  await copyFile(result.path, output);
  await rm(work, { recursive: true, force: true });
  console.log(`Continuous visual preview: ${output}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
