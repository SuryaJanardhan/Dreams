import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright";
import sharp from "sharp";
import type {
  CaptionTrack,
  ContentPlan,
  Narration,
  RenderedVideo,
  ValidatedAsset,
  VisualObject,
  VisualPlan,
  Workspace,
} from "../domain.js";
import type { Config } from "../operations/config.js";
import { command, measureMix, probe } from "../operations/media.js";
import { captionAt, captionPhrases } from "./caption-layout.js";
import { renderObject } from "./components.js";
import {
  compileTimeline,
  evaluateTimelineAt,
  type FrameState,
} from "./timeline.js";

const css = `
@font-face{font-family:Diagram;src:url(data:font/ttf;base64,__FONT__)}
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#fff;color:#151515;font-family:Diagram,Arial,sans-serif}
#yellow{position:absolute;left:0;top:80px;width:250px;height:18px;background:#e7c536}#black{position:absolute;left:250px;top:80px;width:76px;height:18px;background:#151515}
#scene{position:absolute;left:90px;top:150px;width:900px;height:1250px;overflow:hidden}#camera{position:absolute;inset:0;width:900px;height:1250px;transform-origin:0 0}#connectors{position:absolute;inset:0;width:900px;height:1250px;overflow:visible}#objects{position:absolute;inset:0}
.connector{fill:none;stroke:#151515;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}.packet{fill:#2878d0;stroke:#151515;stroke-width:3}
.object{position:absolute;opacity:0;transform-origin:center;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#151515;overflow:visible}
.illustration{width:100%;height:calc(100% - 48px);overflow:visible}.ink{stroke:#151515;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round}.no-fill{fill:none}.paper-fill{fill:#fff}.semantic-fill{fill:color-mix(in srgb,var(--accent) 16%,white)}.warning-fill{fill:#e7c536}.accent-fill{fill:var(--accent);stroke:#151515;stroke-width:2}.accent-line{fill:none;stroke:var(--accent);stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.organic-outline{stroke:#151515;stroke-width:3.2;stroke-linejoin:round}
.object-label{font-size:34px;line-height:1.05;font-weight:700;white-space:nowrap}.object-detail{font-size:23px;line-height:1.05;font-weight:500;margin-top:5px}.free-label{font-size:48px;line-height:1.1;text-align:left;width:100%}
.designed-card{width:100%;height:100%;background:#fff;border:4px solid #151515;border-radius:18px;overflow:hidden;text-align:left;box-shadow:7px 8px 0 color-mix(in srgb,var(--accent) 28%,white)}.card-heading{background:#151515;color:#fff;padding:10px 16px;font-size:28px}.table-row{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;border-top:3px solid #151515;font-size:24px}.table-row span{padding:9px;border-right:2px solid #151515}.table-row span:last-child{border:0}.code-card{font-family:monospace}.code-lines{padding:12px}.code-line{font-size:21px;line-height:1.35;padding:2px 6px;border-radius:5px}.code-line>span{display:inline-block;width:30px;color:#777;margin-right:8px}.code-line.highlighted{background:color-mix(in srgb,var(--accent) 22%,white)}
.image-frame{width:100%;height:calc(100% - 45px);border:4px solid #151515;border-radius:18px;overflow:hidden;background:#fff}.image-frame img{width:100%;height:calc(100% - 30px);object-fit:contain}.browser-dots{height:30px;padding:3px 10px;text-align:left;background:#f1f1ed;border-bottom:3px solid #151515;font-size:15px}
.focused .illustration{filter:drop-shadow(0 0 7px rgba(40,120,208,.38))}.focused .object-label{color:#2878d0}
#captions{position:absolute;left:110px;top:1500px;width:860px;min-height:170px;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:12px;padding:14px 22px;font-size:54px;line-height:1.22;font-weight:700;text-align:center;color:#151515}#captions span.active{color:#2878d0}
`;

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

async function imageData(assets: ValidatedAsset[]) {
  return Object.fromEntries(
    await Promise.all(
      assets.map(async (asset) => [
        asset.id,
        `data:${asset.path.endsWith(".png") ? "image/png" : "image/jpeg"};base64,${(await readFile(asset.path)).toString("base64")}`,
      ]),
    ),
  );
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
  const images = await imageData(assets);
  const objects = plan.world
    .map((object) => renderObject(object, plan.proposedPrimitives, images))
    .join("");
  await page.setContent(
    `<style>${css.replace("__FONT__", font.toString("base64"))}</style><div id="yellow"></div><div id="black"></div><div id="scene"><div id="camera"><svg id="connectors"></svg><div id="objects">${objects}</div></div></div><div id="captions"></div>`,
  );
  await page.waitForFunction(() =>
    [...document.images].every((image) => image.complete),
  );
}

async function setFrame(
  page: Page,
  state: FrameState,
  words: CaptionTrack["words"],
  time: number,
) {
  await page.evaluate(
    ({ state, words, time }) => {
      const camera = document.getElementById("camera");
      if (!camera) throw new Error("Missing camera root");
      camera.style.transform = `translate(${state.camera.x}px,${state.camera.y}px) scale(${state.camera.scale})`;
      const nodes = new Map(
        [...document.querySelectorAll<HTMLElement>("[data-object-id]")].map(
          (node) => [node.dataset.objectId ?? "", node],
        ),
      );
      for (const object of state.objects) {
        const node = nodes.get(object.id);
        if (!node) continue;
        const settle =
          object.internal?.action === "settle"
            ? Math.sin(object.internal.progress * Math.PI) * 0.018
            : 0;
        Object.assign(node.style, {
          left: `${object.box.x}px`,
          top: `${object.box.y}px`,
          width: `${object.box.width}px`,
          height: `${object.box.height}px`,
          opacity: object.visible ? String(object.opacity) : "0",
          transform: `translateY(${(1 - object.opacity) * 18}px) scale(${object.scale + settle})`,
        });
        node.dataset.focus = String(object.focus);
        node.dataset.semantic = object.semantic;
        node.style.setProperty("--accent", object.accent);
        node.classList.toggle("focused", object.focus > 0.35);
        const detail = node.querySelector<HTMLElement>(".object-detail");
        if (detail && object.detail !== undefined)
          detail.textContent = object.detail;
        for (const dot of node.querySelectorAll<SVGElement>(".queue-dot"))
          dot.style.transform = "translateX(0px)";
        const databaseRow = node.querySelector<SVGElement>(".database-row");
        if (databaseRow) databaseRow.style.opacity = "1";
        const shackle = node.querySelector<SVGElement>(".lock-shackle");
        if (shackle) shackle.style.transform = "translateY(0px)";
        for (const line of node.querySelectorAll<HTMLElement>(".code-line"))
          line.classList.remove("highlighted");
        const internal = object.internal;
        if (internal?.action === "queue-advance")
          for (const dot of node.querySelectorAll<SVGElement>(".queue-dot"))
            dot.style.transform = `translateX(${internal.progress * 12}px)`;
        if (internal?.action === "row-insert" && databaseRow) {
          databaseRow.style.opacity = String(internal.progress);
          databaseRow.style.transform = `translateY(${(1 - internal.progress) * 8}px)`;
        }
        if (
          internal &&
          ["lock", "unlock"].includes(internal.action) &&
          shackle
        ) {
          const direction =
            internal.action === "unlock" ? 1 : 1 - internal.progress;
          shackle.style.transform = `translateY(${-direction * 8}px)`;
        }
        if (internal?.action === "highlight-code") {
          const requested = Number(internal.value);
          const lines = [...node.querySelectorAll<HTMLElement>(".code-line")];
          const selected = Number.isInteger(requested)
            ? lines[Math.max(0, requested - 1)]
            : lines[
                Math.floor(internal.progress * Math.max(0, lines.length - 1))
              ];
          selected?.classList.add("highlighted");
        }
      }
      const svg = document.getElementById("connectors");
      svg?.replaceChildren();
      const byId = new Map(state.objects.map((object) => [object.id, object]));
      for (const connector of state.connectors) {
        const from = byId.get(connector.from);
        const to = byId.get(connector.to);
        if (!from || !to || !svg) continue;
        const x1 = from.box.x + from.box.width / 2;
        const y1 = from.box.y + from.box.height / 2;
        const x2 = to.box.x + to.box.width / 2;
        const y2 = to.box.y + to.box.height / 2;
        const bend = Math.max(45, Math.abs(x2 - x1) * 0.34);
        const control1X =
          connector.control1?.x ?? x1 + (x2 >= x1 ? bend : -bend);
        const control1Y = connector.control1?.y ?? y1;
        const control2X =
          connector.control2?.x ?? x2 - (x2 >= x1 ? bend : -bend);
        const control2Y = connector.control2?.y ?? y2;
        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        path.setAttribute("class", "connector");
        path.setAttribute(
          "d",
          `M ${x1} ${y1} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${x2} ${y2}`,
        );
        path.setAttribute("pathLength", "1");
        path.setAttribute("stroke-dasharray", "1");
        path.setAttribute("stroke-dashoffset", String(1 - connector.progress));
        svg.append(path);
        if (connector.packetProgress !== undefined) {
          const p = connector.packetProgress;
          const inverse = 1 - p;
          const packetX =
            inverse ** 3 * x1 +
            3 * inverse ** 2 * p * control1X +
            3 * inverse * p ** 2 * control2X +
            p ** 3 * x2;
          const packetY =
            inverse ** 3 * y1 +
            3 * inverse ** 2 * p * control1Y +
            3 * inverse * p ** 2 * control2Y +
            p ** 3 * y2;
          const packet = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "circle",
          );
          packet.setAttribute("class", "packet");
          packet.setAttribute("r", "12");
          packet.setAttribute("cx", String(packetX));
          packet.setAttribute("cy", String(packetY));
          svg.append(packet);
        }
      }
      const captions = document.getElementById("captions");
      if (!captions) throw new Error("Missing captions");
      captions.replaceChildren(
        ...words.map((word) => {
          const span = document.createElement("span");
          span.textContent = word.text;
          if (word.start <= time && word.end > time) span.className = "active";
          return span;
        }),
      );
    },
    { state, words, time },
  );
}

async function inspectFrame(page: Page, expected: FrameState) {
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
        Number(element.dataset.focus ?? 0) > 0.35 &&
        (box.left < area.left - 2 ||
          box.top < area.top - 2 ||
          box.right > area.right + 2 ||
          box.bottom > area.bottom + 2)
      )
        errors.push(
          `Focused object ${element.dataset.objectId ?? "unknown"} leaves the camera frame`,
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
    return {
      errors,
      actual: all.map((element) => ({
        id: element.dataset.objectId ?? "",
        x: element.offsetLeft,
        y: element.offsetTop,
        width: element.offsetWidth,
        height: element.offsetHeight,
      })),
    };
  });
  const dynamicExpected = expected.objects.map((object) => ({
    id: object.id,
    box: object.box,
  }));
  result.errors.push(...objectGeometryErrors(dynamicExpected, result.actual));
  const screenshot = await page.locator("#scene").screenshot({ type: "png" });
  const stats = await sharp(screenshot).stats();
  if (stats.channels.every((channel) => channel.stdev < 0.5))
    result.errors.push("Blank or uniform diagram frame");
  if (result.errors.length)
    throw new Error([...new Set(result.errors)].join("; "));
  return sharp(screenshot).resize(180, 250).removeAlpha().raw().toBuffer();
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
  const compiled = compileTimeline(visualPlan, track);
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
      ...compiled.actions.flatMap((item) => [
        Math.min(item.end, item.at + 0.12),
        item.end,
      ]),
      ...compiled.camera.flatMap((item) => [item.at, item.end]),
      ...track.beats.flatMap((beat) => [
        Math.min(beat.end, beat.start + 0.12),
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
      const state = evaluateTimelineAt(visualPlan, compiled, time);
      await setFrame(page, state, captionAt(phrases, time), time);
      const sample = await inspectFrame(page, state);
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
        "Continuous visual story does not create enough diagram changes",
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
          evaluateTimelineAt(visualPlan, compiled, time),
          captionAt(phrases, time),
          time,
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

    const cueTimes = compiled.actions
      .filter((item) =>
        [
          "transfer",
          "mutate",
          "row-insert",
          "lock",
          "fail",
          "succeed",
        ].includes(item.action),
      )
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
