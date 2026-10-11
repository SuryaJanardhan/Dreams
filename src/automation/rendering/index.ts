import { chromium, type Browser, type Frame, type Page } from "playwright";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import type {
  CaptionTrack,
  ContentPlan,
  Narration,
  RenderedVideo,
  TimedBeat,
  Workspace,
} from "../domain.js";
import type { Config } from "../operations/config.js";
import { Gemini } from "../content/index.js";
import { probe } from "../operations/media.js";
import { validateScene } from "./code.js";
import type { SceneContext, Scene } from "./scene-contract.js";
import type { gsap } from "gsap";
const requireLocal = createRequire(resolve(process.cwd(), "package.json"));
const sourceSchema = z.object({ source: z.string().min(1) });
export interface SceneGenerator {
  generate(
    beat: TimedBeat,
    words: CaptionTrack["words"],
    feedback: string,
  ): Promise<string>;
}
interface SceneWindow extends Window {
  TrustedGsap: { gsap: typeof gsap };
  GeneratedScene: { createScene(context: SceneContext): Scene };
  sceneTimeline: gsap.core.Timeline;
}
const css =
  "html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#050505;color:#fff;font-family:Arial,sans-serif}#scene{position:absolute;left:60px;top:130px;width:900px;height:1310px;border:0}#captions{position:absolute;left:90px;top:1490px;width:840px;height:190px;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:12px;font-size:48px;line-height:1.3;font-weight:bold;text-align:center}";
function gsapScript() {
  const bundle = buildSync({
    entryPoints: [requireLocal.resolve("gsap")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "TrustedGsap",
    platform: "browser",
  });
  const text = bundle.outputFiles?.[0]?.text;
  if (!text) throw new Error("GSAP bundling failed");
  return text;
}
async function deadline<T>(
  operation: Promise<T>,
  ms: number,
  terminate: () => void,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          terminate();
          reject(new Error("Generated animation execution timed out"));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export function sceneGenerator(config: Config, gemini: Gemini): SceneGenerator {
  return {
    async generate(beat, words, feedback) {
      const result = await gemini.generate(
        config.GEMINI_VISUAL_MODEL,
        config.GEMINI_API_KEY_FOR_VISUALS,
        `Write a custom TypeScript animation scene for a technical educational reel. Output JSON {source: string}. Explain this beat: ${JSON.stringify(beat)}. Actual timed narration words: ${JSON.stringify(words)}.
Import type {SceneContext,Scene} from './scene-contract'; export function createScene(context:SceneContext):Scene. Context root is a 900x1310 safe-area element; timeline is an already paused GSAP timeline, duration is scene seconds, words are relative-time anchors. Build original HTML/SVG technical diagrams with dark background, cyan/magenta accents, clear connections, staged transitions, minimal keywords. No humans/presenter or captions. Text >=40px; keep every visible element inside root. The renderer owns all timing and captions.
Use context.timeline.to/fromTo/set at explicit word/beat times; do not play timeline, add callbacks, independent timelines, clocks, timers, CSS animation, imports except the type contract, remote assets, canvas, video, external URLs, random, any, type assertions, eval, or global state. Use only context.root and provided timeline. Animate meaningful content throughout scene; avoid blank openings. SVG connectors must be precise. Return {dispose(){context.root.replaceChildren();}}. Ensure calling timeline.seek at any scene time produces the intended visual state without callbacks. ${feedback ? `Repair the prior rejected scene. Errors: ${feedback}` : ""}`,
        sourceSchema,
      );
      return result.source;
    },
  };
}
async function loadScene(
  page: Page,
  browser: Browser,
  code: string,
  library: string,
  beat: TimedBeat,
  words: CaptionTrack["words"],
): Promise<Frame> {
  await page.setContent(
    `<style>${css}</style><iframe id="scene" name="animation" sandbox="allow-scripts"></iframe><div id="captions"></div>`,
  );
  const html = `<style>html,body{margin:0;background:#050505;color:white;font-family:Arial,sans-serif}#root{position:relative;width:900px;height:1310px;overflow:hidden}</style><div id="root"></div><script>${library.replace(/<\/script/gi, "<\\/script")}</script><script>${code.replace(/<\/script/gi, "<\\/script")}</script>`;
  await page.locator("#scene").evaluate((element, html) => {
    if (!(element instanceof HTMLIFrameElement))
      throw new Error("Missing scene frame");
    element.srcdoc = html;
  }, html);
  const frame =
    page.frames().find((candidate) => candidate.name() === "animation") ??
    (await page.waitForEvent("frameattached", { timeout: 10000 }));
  if (!frame) throw new Error("Animation frame missing");
  await frame.waitForFunction(
    () =>
      Boolean((window as unknown as SceneWindow).GeneratedScene?.createScene),
    {},
    { timeout: 10000 },
  );
  await deadline(
    frame.evaluate(
      ({ duration, words }) => {
        const runtime = window as unknown as SceneWindow;
        const root = document.getElementById("root");
        if (!root || typeof runtime.GeneratedScene?.createScene !== "function")
          throw new Error("Scene must export createScene");
        const timeline = runtime.TrustedGsap.gsap.timeline({ paused: true });
        runtime.sceneTimeline = timeline;
        const result = runtime.GeneratedScene.createScene({
          root,
          timeline,
          width: 900,
          height: 1310,
          duration,
          words,
        });
        if (!result || typeof result.dispose !== "function")
          throw new Error("Scene must return dispose");
      },
      {
        duration: beat.end - beat.start,
        words: words
          .filter((word) => word.start >= beat.start && word.start < beat.end)
          .map((word) => ({
            ...word,
            start: word.start - beat.start,
            end: word.end - beat.start,
          })),
      },
    ),
    10000,
    () => {
      void browser.close();
    },
  );
  return frame;
}
async function setTime(
  frame: Frame,
  page: Page,
  browser: Browser,
  time: number,
  words: CaptionTrack["words"],
  captionTime: number,
) {
  await deadline(
    frame.evaluate((time) => {
      const runtime = window as unknown as SceneWindow;
      runtime.sceneTimeline.seek(time, true);
    }, time),
    5000,
    () => {
      void browser.close();
    },
  );
  await page.locator("#captions").evaluate(
    (element, words) => {
      element.replaceChildren(
        ...words.map((word) => {
          const span = document.createElement("span");
          span.textContent = word.text;
          span.style.color = word.active ? "#22d3ee" : "white";
          return span;
        }),
      );
    },
    words.map((word) => ({
      text: word.text,
      active: word.start <= captionTime && word.end > captionTime,
    })),
  );
}
async function inspectFrame(frame: Frame, page: Page): Promise<number> {
  const errors = await frame.evaluate(() => {
    const root = document.getElementById("root");
    if (!root) return ["Missing root"];
    const area = root.getBoundingClientRect();
    const errors: string[] = [];
    for (const element of root.querySelectorAll("*")) {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0 ||
        !box.width ||
        !box.height
      )
        continue;
      if (
        box.left < area.left - 2 ||
        box.top < area.top - 2 ||
        box.right > area.right + 2 ||
        box.bottom > area.bottom + 2
      )
        errors.push("Scene geometry extends beyond its safe area");
      if (
        element.children.length === 0 &&
        element.textContent?.trim() &&
        !(element instanceof SVGElement) &&
        parseFloat(style.fontSize) < 36
      )
        errors.push("Scene text below readable minimum");
    }
    return [...new Set(errors)];
  });
  const buffer = await page.locator("#scene").screenshot();
  const stats = await sharp(buffer).stats();
  if (stats.channels.every((channel) => channel.stdev < 3))
    errors.push("Blank or uniform scene");
  const caption = await page
    .locator("#captions")
    .evaluate(
      (element) =>
        element.scrollHeight > element.clientHeight ||
        element.scrollWidth > element.clientWidth,
    );
  if (caption) errors.push("Caption text overflows safe area");
  if (errors.length) throw new Error(errors.join("; "));
  return 100;
}
function captionGroup(words: CaptionTrack["words"], time: number) {
  const index = words.findIndex(
    (word) => word.start <= time && word.end > time,
  );
  if (index < 0) return [];
  const start = Math.floor(index / 5) * 5;
  return words.slice(start, start + 5);
}
export interface RenderOptions {
  config: Pick<Config, "root" | "COVER_INTRO_DURATION_SEC">;
  signal: AbortSignal;
  generator: SceneGenerator;
  log?: (message: string) => void;
}
export async function renderVideo(
  plan: ContentPlan,
  narration: Narration,
  track: CaptionTrack,
  workspace: Workspace,
  options: RenderOptions,
): Promise<RenderedVideo> {
  const { signal, generator, config } = options;
  signal.throwIfAborted();
  const library = gsapScript();
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });
  const abort = () => {
    void browser.close();
  };
  signal.addEventListener("abort", abort, { once: true });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
  });
  await context.route("**/*", (route) => route.abort()); // No scene access to providers, files, or credentials.
  const page = await context.newPage();
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  const accepted: { beat: TimedBeat; code: string }[] = [];
  try {
    for (const beat of track.beats) {
      let error = "";
      let code: string | undefined;
      for (let attempt = 0; attempt < 2; attempt++)
        try {
          runtimeErrors.length = 0;
          const source = await generator.generate(beat, track.words, error);
          const compiled = await validateScene(
            source,
            `${beat.id}.ts`,
            workspace,
            config.root,
          );
          const frame = await loadScene(
            page,
            browser,
            compiled,
            library,
            beat,
            track.words,
          );
          for (const fraction of [0.05, 0.5, 0.95]) {
            const relative = (beat.end - beat.start) * fraction;
            await setTime(
              frame,
              page,
              browser,
              relative,
              captionGroup(track.words, beat.start + relative),
              beat.start + relative,
            );
            await inspectFrame(frame, page);
          }
          if (runtimeErrors.length) throw new Error(runtimeErrors.join("; "));
          code = compiled;
          break;
        } catch (cause) {
          if (signal.aborted) throw cause;
          error = cause instanceof Error ? cause.message : String(cause);
          options.log?.(`Repairing scene ${beat.id}: ${error.slice(0, 300)}`);
        }
      if (!code)
        throw new Error(
          `Scene ${beat.id} rejected after two attempts: ${error}`,
        );
      accepted.push({ beat, code });
    }
    const silent = workspace.file("visuals.mp4");
    const output = workspace.file("final.mp4");
    const encoder = spawn(
      "ffmpeg",
      [
        "-y",
        "-f",
        "image2pipe",
        "-vcodec",
        "png",
        "-framerate",
        "60",
        "-i",
        "pipe:0",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "60",
        silent,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let stderr = "";
    let encodeError: Error | undefined;
    encoder.stderr.on("data", (buffer: Buffer) => {
      stderr = (stderr + buffer.toString()).slice(-3000);
    });
    encoder.stdin.on("error", (error) => {
      encodeError = error;
    });
    const completion = new Promise<void>((resolve, reject) => {
      encoder.on("error", reject);
      encoder.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`Frame encoder failed: ${stderr}`)),
      );
    });
    completion.catch(() => {});
    const killEncoder = () => encoder.kill("SIGKILL");
    signal.addEventListener("abort", killEncoder, { once: true });
    let loaded = -1;
    let frame: Frame | undefined;
    const total = narration.duration + config.COVER_INTRO_DURATION_SEC;
    const cover = await sharp(
      await readFile(resolve(config.root, "assets/cover.png")),
    )
      .resize(1080, 1920, { fit: "contain", background: "#050505" })
      .png()
      .toBuffer();
    try {
      for (let index = 0; index < Math.ceil(total * 60); index++) {
        signal.throwIfAborted();
        if (runtimeErrors.length) throw new Error(runtimeErrors.join("; "));
        if (encodeError) throw encodeError;
        let buffer: Buffer;
        const time = index / 60 - config.COVER_INTRO_DURATION_SEC;
        if (time < 0) buffer = cover;
        else {
          const chosen = Math.max(
            0,
            accepted.findIndex(
              (scene, i) =>
                time < (accepted[i + 1]?.beat.start ?? narration.duration),
            ),
          );
          const scene = accepted[chosen];
          if (!scene) throw new Error("No accepted animation scene");
          if (chosen !== loaded) {
            frame = await loadScene(
              page,
              browser,
              scene.code,
              library,
              scene.beat,
              track.words,
            );
            loaded = chosen;
          }
          if (!frame) throw new Error("No animation frame loaded");
          await setTime(
            frame,
            page,
            browser,
            Math.min(
              Math.max(time - scene.beat.start, 0),
              scene.beat.end - scene.beat.start,
            ),
            captionGroup(track.words, time),
            time,
          );
          buffer = await page.screenshot({ type: "png", animations: "allow" });
        }
        if (!encoder.stdin.write(buffer))
          await Promise.race([
            once(encoder.stdin, "drain"),
            completion.then(() => {
              throw new Error("Encoder ended before all frames were written");
            }),
          ]);
        if (index % 600 === 0)
          options.log?.(`Rendered frame ${index}/${Math.ceil(total * 60)}`);
      }
      encoder.stdin.end();
      await completion;
    } catch (error) {
      encoder.kill("SIGKILL");
      await completion.catch(() => {});
      throw error;
    } finally {
      signal.removeEventListener("abort", killEncoder);
    }
    const { command } = await import("../operations/media.js");
    const intro = Math.round(config.COVER_INTRO_DURATION_SEC * 1000);
    await command(
      "ffmpeg",
      [
        "-y",
        "-i",
        silent,
        "-i",
        narration.path,
        "-stream_loop",
        "-1",
        "-i",
        resolve(config.root, "assets/Bgm.m4a"),
        "-filter_complex",
        `[1:a]adelay=${intro}|${intro},apad,asplit=2[voice][side];[2:a]volume=0.2[music];[music][side]sidechaincompress=threshold=0.015:ratio=8:attack=10:release=300[ducked];[voice][ducked]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.89[mix]`,
        "-map",
        "0:v",
        "-map",
        "[mix]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-t",
        String(total),
        "-movflags",
        "+faststart",
        output,
      ],
      signal,
    );
    const metadata = await probe(output, signal);
    const video = metadata.streams.find(
      (stream) => stream.codec_type === "video",
    );
    if (
      video?.width !== 1080 ||
      video.height !== 1920 ||
      video.r_frame_rate !== "60/1" ||
      video.codec_name !== "h264" ||
      !metadata.streams.some((stream) => stream.codec_type === "audio") ||
      Math.abs(metadata.format.duration - total) > 0.1
    )
      throw new Error(
        "Rendered media failed resolution/frame-rate/duration/audio verification",
      );
    return {
      path: output,
      duration: metadata.format.duration,
      width: 1080,
      height: 1920,
      fps: 60,
      grade: 100,
    };
  } finally {
    signal.removeEventListener("abort", abort);
    await browser.close();
  }
}
