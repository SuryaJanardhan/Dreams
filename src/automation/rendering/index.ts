import { chromium, type Page } from "playwright";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import type {
  CaptionTrack,
  ContentPlan,
  Narration,
  RenderedVideo,
  ValidatedAsset,
  VisualObject,
  VisualPlan,
  VisualTransition,
  Workspace,
} from "../domain.js";
import type { Config } from "../operations/config.js";
import { command, measureMix, probe } from "../operations/media.js";
import { captionAt, captionPhrases } from "./caption-layout.js";

const palette = {
  structure: "#151515",
  active: "#2878d0",
  success: "#3f8f62",
  warning: "#e7c536",
  failure: "#cf4e46",
} as const;
const css = `
@font-face{font-family:Diagram;src:url(data:font/ttf;base64,__FONT__)}
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#fff;color:#151515;font-family:Diagram,Arial,sans-serif}
#yellow{position:absolute;left:0;top:80px;width:250px;height:18px;background:#e7c536}#black{position:absolute;left:250px;top:80px;width:76px;height:18px;background:#151515}
#scene{position:absolute;left:90px;top:150px;width:900px;height:1250px;overflow:hidden}#connectors{position:absolute;inset:0;width:900px;height:1250px}.connector{stroke:#151515;stroke-width:7;stroke-linecap:round}.packet{fill:#2878d0}
.object{position:absolute;border:5px solid #151515;border-radius:20px;background:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:18px;font-size:38px;line-height:1.12;font-weight:700;opacity:0;overflow:hidden;transform-origin:center}
.object[data-semantic=active]{border-color:#2878d0}.object[data-semantic=success]{border-color:#3f8f62}.object[data-semantic=warning]{border-color:#e7c536}.object[data-semantic=failure]{border-color:#cf4e46}.focused{box-shadow:0 0 0 10px rgba(40,120,208,.16)}.dimmed{opacity:.28!important}.removed{opacity:0!important}
.kind-label{border:0;background:transparent;justify-content:flex-start;text-align:left;padding:0;font-size:52px}.kind-code-card{align-items:stretch;justify-content:flex-start;flex-direction:column;text-align:left;padding:0;font-family:monospace;font-size:30px}.code-title{padding:14px 18px;background:#151515;color:#fff}.code-body{padding:18px;white-space:pre-wrap}
.kind-table{padding:0;display:block}.table-title{padding:10px;background:#151515;color:#fff}.table-row{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;border-top:3px solid #151515;font-size:27px}.table-cell{padding:10px;border-right:2px solid #151515}.table-cell:last-child{border:0}.kind-database{border-radius:50% / 12%;padding-top:25px}.kind-file:before{content:"";position:absolute;right:0;top:0;border-left:36px solid transparent;border-bottom:36px solid #e7c536}
.kind-queue{gap:8px}.queue-dot{width:24px;height:24px;border:4px solid #151515;border-radius:50%}.kind-browser{padding-top:45px}.kind-browser:before{content:"●  ●  ●";position:absolute;left:0;right:0;top:0;height:36px;padding-left:12px;text-align:left;background:#f0f0ed;border-bottom:4px solid #151515;font-size:20px}.kind-lock:before{content:"⌑";font-size:54px;margin-right:12px}.kind-badge{border-radius:999px}.kind-image{padding:0}.kind-image img{width:100%;height:100%;object-fit:contain}.kind-composite svg{width:100%;height:100%}.detail{display:block;font-size:25px;font-weight:500;margin-top:8px}
#captions{position:absolute;left:110px;top:1500px;width:860px;min-height:170px;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:12px;padding:14px 22px;font-size:54px;line-height:1.22;font-weight:700;text-align:center;color:#151515}#captions span.active{color:#2878d0}
`;

interface ResolvedTransition extends VisualTransition {
  at: number;
  end: number;
}
function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
export function resolveTransitions(
  plan: VisualPlan,
  track: CaptionTrack,
): ResolvedTransition[] {
  const resolved: ResolvedTransition[] = [];
  for (const visualBeat of plan.beats) {
    const beat = track.beats.find((item) => item.id === visualBeat.beatId);
    if (!beat) throw new Error(`Missing timed beat ${visualBeat.beatId}`);
    const words = track.words.filter(
      (word) => word.start >= beat.start && word.start < beat.end,
    );
    const normalized = words.map((word) => tokens(word.text)[0] ?? "");
    for (const transition of visualBeat.transitions) {
      const anchor = tokens(transition.anchor);
      let found = -1;
      for (let start = 0; start <= normalized.length - anchor.length; start++)
        if (
          anchor.every((word, offset) => normalized[start + offset] === word)
        ) {
          found = start;
          break;
        }
      const first = words[found];
      const last = words[found + anchor.length - 1];
      if (found < 0 || !first || !last)
        throw new Error(
          `Could not align visual anchor ${JSON.stringify(transition.anchor)} in ${beat.id}`,
        );
      resolved.push({
        ...transition,
        at: first.start,
        end: Math.min(beat.end, Math.max(last.end, first.start + 0.55)),
      });
    }
  }
  return resolved.sort((a, b) => a.at - b.at);
}

interface PositionedObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export function objectGeometryErrors(
  expected: Pick<VisualObject, "id" | "box">[],
  actual: PositionedObject[],
) {
  const errors: string[] = [];
  for (const object of expected) {
    const found = actual.find((candidate) => candidate.id === object.id);
    if (!found) {
      errors.push(`Visual object missing: ${object.id}`);
      continue;
    }
    if (
      Math.abs(found.x - object.box.x) > 3 ||
      Math.abs(found.y - object.box.y) > 3
    )
      errors.push(`Visual object position drifted: ${object.id}`);
    if (
      Math.abs(found.width - object.box.width) > 3 ||
      Math.abs(found.height - object.box.height) > 3
    )
      errors.push(`Visual object size drifted: ${object.id}`);
  }
  return errors;
}

async function setupPage(
  page: Page,
  config: Pick<Config, "root">,
  plan: VisualPlan,
  assets: ValidatedAsset[],
) {
  const font = await readFile(
    resolve(config.root, "fonts/BalsamiqSans-Bold.ttf"),
  );
  await page.setContent(
    `<style>${css.replace("__FONT__", font.toString("base64"))}</style><div id="yellow"></div><div id="black"></div><div id="scene"><svg id="connectors"></svg><div id="objects"></div></div><div id="captions"></div>`,
  );
  const images = Object.fromEntries(
    await Promise.all(
      assets.map(async (asset) => [
        asset.id,
        `data:${asset.path.endsWith(".png") ? "image/png" : "image/jpeg"};base64,${(await readFile(asset.path)).toString("base64")}`,
      ]),
    ),
  );
  await page.evaluate(
    ({ plan, palette, images }) => {
      const root = document.getElementById("objects");
      if (!root) throw new Error("Missing object root");
      for (const object of plan.objects) {
        const element = document.createElement("div");
        element.className = `object kind-${object.kind}`;
        element.dataset.objectId = object.id;
        element.dataset.semantic = object.semantic;
        Object.assign(element.style, {
          left: `${object.box.x}px`,
          top: `${object.box.y}px`,
          width: `${object.box.width}px`,
          height: `${object.box.height}px`,
        });
        if (object.kind === "code-card") {
          const title = document.createElement("div");
          title.className = "code-title";
          title.textContent = object.label;
          const body = document.createElement("div");
          body.className = "code-body";
          body.textContent = object.detail ?? "";
          element.append(title, body);
        } else if (object.kind === "table") {
          const title = document.createElement("div");
          title.className = "table-title";
          title.textContent = object.label;
          element.append(title);
          for (const cells of object.rows ?? []) {
            const row = document.createElement("div");
            row.className = "table-row";
            for (const value of cells) {
              const cell = document.createElement("div");
              cell.className = "table-cell";
              cell.textContent = value;
              row.append(cell);
            }
            element.append(row);
          }
        } else if (object.kind === "queue") {
          for (let index = 0; index < 4; index++) {
            const dot = document.createElement("span");
            dot.className = "queue-dot";
            element.append(dot);
          }
        } else if (object.kind === "image") {
          const source = object.assetId ? images[object.assetId] : undefined;
          if (!source)
            throw new Error(`Validated image missing for ${object.id}`);
          const image = document.createElement("img");
          image.src = source;
          image.alt = object.label;
          element.append(image);
        } else if (object.kind === "composite") {
          const spec = plan.proposedPrimitives.find(
            (item) => item.id === object.primitiveId,
          );
          if (!spec) throw new Error(`Primitive missing for ${object.id}`);
          const svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
          );
          svg.setAttribute("viewBox", "0 0 100 100");
          for (const shape of spec.shapes) {
            const tag = shape.kind === "text" ? "text" : shape.kind;
            const node = document.createElementNS(
              "http://www.w3.org/2000/svg",
              tag,
            );
            node.setAttribute("x", String(shape.x));
            node.setAttribute("y", String(shape.y));
            node.setAttribute("stroke", palette[shape.semantic]);
            node.setAttribute(
              "fill",
              shape.kind === "text" ? palette[shape.semantic] : "none",
            );
            node.setAttribute("stroke-width", "3");
            if (shape.width !== undefined)
              node.setAttribute("width", String(shape.width));
            if (shape.height !== undefined)
              node.setAttribute("height", String(shape.height));
            if (shape.kind === "circle")
              node.setAttribute("r", String((shape.width ?? 10) / 2));
            if (shape.kind === "line") {
              node.setAttribute("x2", String(shape.x + (shape.width ?? 10)));
              node.setAttribute("y2", String(shape.y + (shape.height ?? 0)));
            }
            if (shape.kind === "path") node.setAttribute("d", shape.text ?? "");
            if (shape.kind === "text") {
              node.textContent = shape.text ?? "";
              node.setAttribute("font-size", "10");
            }
            svg.append(node);
          }
          element.append(svg);
        } else {
          const label = document.createElement("span");
          label.textContent = object.label;
          element.append(label);
          if (object.detail) {
            const detail = document.createElement("span");
            detail.className = "detail";
            detail.textContent = object.detail;
            element.append(detail);
          }
        }
        root.append(element);
      }
    },
    { plan, palette, images },
  );
}

async function setFrame(
  page: Page,
  plan: VisualPlan,
  transitions: ResolvedTransition[],
  time: number,
  words: CaptionTrack["words"],
) {
  await page.evaluate(
    ({ plan, transitions, time, words }) => {
      const nodes = new Map(
        [...document.querySelectorAll<HTMLElement>("[data-object-id]")].map(
          (node) => [node.dataset.objectId ?? "", node],
        ),
      );
      for (const node of nodes.values()) {
        node.style.opacity = "0";
        node.style.transform = "scale(.94)";
        node.classList.remove("focused", "dimmed", "removed");
      }
      const svg = document.getElementById("connectors");
      svg?.replaceChildren();
      const visible = new Set<string>();
      for (const transition of transitions) {
        if (time < transition.at) continue;
        const progress = Math.max(
          0,
          Math.min(
            1,
            (time - transition.at) / (transition.end - transition.at),
          ),
        );
        if (transition.operation === "remove")
          transition.objectIds.forEach((id) => visible.delete(id));
        else if (transition.operation !== "dim")
          transition.objectIds.forEach((id) => visible.add(id));
        for (const id of transition.objectIds) {
          const node = nodes.get(id);
          if (!node) continue;
          if (["focus", "compare"].includes(transition.operation))
            node.classList.add("focused");
          if (transition.operation === "dim") node.classList.add("dimmed");
          if (transition.operation === "remove" && progress >= 1)
            node.classList.add("removed");
          if (transition.operation === "mutate" && transition.value) {
            const detail = node.querySelector<HTMLElement>(".detail");
            if (detail) detail.textContent = transition.value;
          }
        }
        if (
          ["draw", "transfer"].includes(transition.operation) &&
          transition.objectIds.length >= 2 &&
          svg
        ) {
          const from = plan.objects.find(
            (item) => item.id === transition.objectIds[0],
          );
          const to = plan.objects.find(
            (item) => item.id === transition.objectIds[1],
          );
          if (from && to) {
            const x1 = from.box.x + from.box.width / 2;
            const y1 = from.box.y + from.box.height / 2;
            const x2 = to.box.x + to.box.width / 2;
            const y2 = to.box.y + to.box.height / 2;
            const line = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "line",
            );
            line.setAttribute("class", "connector");
            line.setAttribute("x1", String(x1));
            line.setAttribute("y1", String(y1));
            line.setAttribute("x2", String(x1 + (x2 - x1) * progress));
            line.setAttribute("y2", String(y1 + (y2 - y1) * progress));
            svg.append(line);
            if (transition.operation === "transfer") {
              const packet = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "circle",
              );
              packet.setAttribute("class", "packet");
              packet.setAttribute("r", "13");
              packet.setAttribute("cx", String(x1 + (x2 - x1) * progress));
              packet.setAttribute("cy", String(y1 + (y2 - y1) * progress));
              svg.append(packet);
            }
          }
        }
      }
      for (const id of visible) {
        const node = nodes.get(id);
        if (!node) continue;
        const first = transitions.find((item) => item.objectIds.includes(id));
        const progress = first
          ? Math.max(0, Math.min(1, (time - first.at) / (first.end - first.at)))
          : 1;
        node.style.opacity = String(progress);
        node.style.transform = `scale(${0.94 + progress * 0.06})`;
      }
      const captions = document.getElementById("captions");
      if (!captions) throw new Error("Missing captions");
      captions.replaceChildren(
        ...words.map((word) => {
          const span = document.createElement("span");
          span.textContent = word.text;
          if (word.active) span.className = "active";
          return span;
        }),
      );
    },
    {
      plan,
      transitions,
      time,
      words: words.map((word) => ({
        text: word.text,
        active: word.start <= time && word.end > time,
      })),
    },
  );
}

async function inspectFrame(page: Page, expected: VisualObject[]) {
  const result = await page.evaluate(() => {
    const scene = document.getElementById("scene");
    if (!scene) return { errors: ["Missing scene"], actual: [] };
    const area = scene.getBoundingClientRect();
    const errors: string[] = [];
    const all = [...scene.querySelectorAll<HTMLElement>(".object")];
    const visible = all.filter(
      (element) => Number(getComputedStyle(element).opacity) > 0.05,
    );
    if (visible.length > 7)
      errors.push("More than seven meaningful objects visible");
    for (const element of visible) {
      const box = element.getBoundingClientRect();
      if (
        box.left < area.left - 2 ||
        box.top < area.top - 2 ||
        box.right > area.right + 2 ||
        box.bottom > area.bottom + 2
      )
        errors.push(
          `Object ${element.dataset.objectId ?? "unknown"} leaves safe area`,
        );
      if (
        element.scrollWidth > element.clientWidth + 2 ||
        element.scrollHeight > element.clientHeight + 2
      )
        errors.push(
          `Object ${element.dataset.objectId ?? "unknown"} content overflows`,
        );
    }
    const captions = document.getElementById("captions");
    if (
      captions &&
      (captions.scrollWidth > captions.clientWidth ||
        captions.scrollHeight > captions.clientHeight)
    )
      errors.push("Caption text overflows safe area");
    const actual = all.map((element) => ({
      id: element.dataset.objectId ?? "",
      x: element.offsetLeft,
      y: element.offsetTop,
      width: element.offsetWidth,
      height: element.offsetHeight,
    }));
    return { errors, actual };
  });
  result.errors.push(...objectGeometryErrors(expected, result.actual));
  const screenshot = await page.screenshot({ type: "png" });
  const stats = await sharp(screenshot).stats();
  if (stats.channels.every((channel) => channel.stdev < 3))
    result.errors.push("Blank or uniform frame");
  if (result.errors.length)
    throw new Error([...new Set(result.errors)].join("; "));
  return sharp(screenshot).resize(180, 320).removeAlpha().raw().toBuffer();
}

export interface RenderOptions {
  config: Pick<Config, "root">;
  signal: AbortSignal;
  assets?: ValidatedAsset[];
  log?: (message: string) => void;
}
export async function renderVideo(
  _plan: ContentPlan,
  visualPlan: VisualPlan,
  narration: Narration,
  track: CaptionTrack,
  workspace: Workspace,
  options: RenderOptions,
): Promise<RenderedVideo> {
  const { signal, config } = options;
  const transitions = resolveTransitions(visualPlan, track);
  const phrases = captionPhrases(track.words);
  const configuredBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const systemBrowser = existsSync("/usr/bin/google-chrome")
    ? "/usr/bin/google-chrome"
    : undefined;
  const executablePath = configuredBrowser || systemBrowser;
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
    ...(executablePath ? { executablePath } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
  });
  await context.route("**/*", (route) => route.abort());
  const page = await context.newPage();
  const abort = () => void browser.close();
  signal.addEventListener("abort", abort, { once: true });
  try {
    await setupPage(page, config, visualPlan, options.assets ?? []);
    const sampleTimes = [
      0.05,
      ...transitions.flatMap((item) => [item.at, item.end]),
      ...track.beats.flatMap((beat) => [
        beat.start,
        (beat.start + beat.end) / 2,
      ]),
      Math.max(0, narration.duration - 0.05),
    ]
      .map((time) => Math.max(0, Math.min(narration.duration - 0.01, time)))
      .filter((time, index, list) => list.indexOf(time) === index)
      .sort((a, b) => a - b);
    let previous: Buffer | undefined;
    let changed = 0;
    for (const time of sampleTimes) {
      await setFrame(
        page,
        visualPlan,
        transitions,
        time,
        captionAt(phrases, time),
      );
      const sample = await inspectFrame(page, visualPlan.objects);
      if (previous) {
        let difference = 0;
        for (let index = 0; index < sample.length; index++)
          difference += Math.abs((sample[index] ?? 0) - (previous[index] ?? 0));
        if (difference / sample.length > 0.02) changed++;
      }
      previous = sample;
    }
    if (changed < Math.max(1, track.beats.length - 1))
      throw new Error(
        "Visual plan does not create enough measurable explanation changes",
      );
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
    encoder.stderr.on(
      "data",
      (buffer: Buffer) => (stderr = (stderr + buffer.toString()).slice(-3000)),
    );
    const completion = new Promise<void>((done, reject) => {
      encoder.on("error", reject);
      encoder.on("close", (code) =>
        code === 0
          ? done()
          : reject(new Error(`Frame encoder failed: ${stderr}`)),
      );
    });
    completion.catch(() => {});
    const stop = () => encoder.kill("SIGKILL");
    signal.addEventListener("abort", stop, { once: true });
    try {
      const frames = Math.ceil(narration.duration * 60);
      for (let index = 0; index < frames; index++) {
        signal.throwIfAborted();
        const time = index / 60;
        await setFrame(
          page,
          visualPlan,
          transitions,
          time,
          captionAt(phrases, time),
        );
        const buffer = await page.screenshot({ type: "png" });
        if (!encoder.stdin.write(buffer))
          await Promise.race([
            once(encoder.stdin, "drain"),
            completion.then(() => {
              throw new Error("Encoder ended early");
            }),
          ]);
        if (index % 600 === 0)
          options.log?.(`Rendered frame ${index}/${frames}`);
      }
      encoder.stdin.end();
      await completion;
    } catch (error) {
      encoder.kill("SIGKILL");
      await completion.catch(() => {});
      throw error;
    } finally {
      signal.removeEventListener("abort", stop);
    }
    const cueTimes = transitions
      .filter((item) => ["transfer", "mutate"].includes(item.operation))
      .map((item) => item.at)
      .filter(
        (time, index, times) =>
          index === 0 || time - (times[index - 1] ?? 0) >= 4,
      )
      .slice(0, 4);
    const cueInputs = cueTimes.flatMap((time) => [
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=720:sample_rate=48000:duration=0.08,volume=0.025,adelay=${Math.round(time * 1000)}|${Math.round(time * 1000)}`,
    ]);
    const cueLabels = cueTimes
      .map((_time, index) => `[${index + 3}:a]`)
      .join("");
    const cueMix = cueTimes.length
      ? `${cueLabels}amix=inputs=${cueTimes.length}:duration=longest:normalize=0[cues];`
      : "anullsrc=r=48000:cl=stereo[cues];";
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
        ...cueInputs,
        "-filter_complex",
        `${cueMix}[2:a]volume=0.06,afade=t=in:st=0:d=0.35,afade=t=out:st=${Math.max(0, narration.duration - 0.6)}:d=0.6[music];[music][1:a]sidechaincompress=threshold=0.015:ratio=8:attack=10:release=300[ducked];[1:a][ducked][cues]amix=inputs=3:duration=first:normalize=0,alimiter=limit=0.78:level=false[mix]`,
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
        String(narration.duration),
        "-movflags",
        "+faststart",
        output,
      ],
      signal,
    );
    const mix = await measureMix(output, signal);
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
      Math.abs(metadata.format.duration - narration.duration) > 0.1
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
      grade: Math.min(100, 85 + changed),
      checks: {
        sampledStates: sampleTimes.length,
        changingScenes: changed,
        ...mix,
      },
    };
  } finally {
    signal.removeEventListener("abort", abort);
    await browser.close().catch(() => {});
  }
}
