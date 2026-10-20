import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import sharp from "sharp";
import { command, measureMix, probe } from "../automation/operations/media.js";
import type { MockScene, RenderResult } from "./domain.js";
import { validateAssetPack } from "./assets.js";

function xml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function lines(text: string, limit = 24): string[] {
  const result: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (current && `${current} ${word}`.length > limit) {
      result.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) result.push(current);
  return result.slice(0, 2);
}

function illustration(side: "left" | "right", active: boolean) {
  const x = side === "left" ? 74 : 574;
  const opacity = active ? 1 : 0.36;
  if (side === "left")
    return `<g opacity="${opacity}">
      <rect x="${x + 34}" y="350" width="398" height="286" rx="24" fill="#fff" stroke="#111" stroke-width="9"/>
      <path d="M${x + 34} 415h398" stroke="#111" stroke-width="8"/>
      <circle cx="${x + 68}" cy="383" r="10" fill="#f6d84a"/><circle cx="${x + 100}" cy="383" r="10" fill="#111"/>
      <rect x="${x + 135}" y="368" width="260" height="30" rx="15" fill="#fff" stroke="#111" stroke-width="4"/>
      <rect x="${x + 72}" y="450" width="322" height="62" rx="13" fill="#f6d84a"/>
      <rect x="${x + 72}" y="536" width="145" height="18" rx="9" fill="#111"/>
      <rect x="${x + 72}" y="570" width="276" height="13" rx="6" fill="#111" opacity=".62"/>
      <rect x="${x + 72}" y="596" width="225" height="13" rx="6" fill="#111" opacity=".36"/>
    </g>`;
  return `<g opacity="${opacity}">
    <rect x="${x + 34}" y="350" width="398" height="286" rx="24" fill="#fff" stroke="#111" stroke-width="9"/>
    <text x="${x + 233}" y="409" text-anchor="middle" font-family="Noto Sans,Arial" font-size="35" font-weight="900" fill="#111">SEARCH</text>
    <rect x="${x + 67}" y="438" width="332" height="58" rx="29" fill="#fff" stroke="#111" stroke-width="5"/>
    <circle cx="${x + 108}" cy="467" r="15" fill="none" stroke="#111" stroke-width="6"/><path d="M${x + 119} 478l15 15" stroke="#111" stroke-width="6"/>
    <text x="${x + 160}" y="478" font-family="Noto Sans,Arial" font-size="23" font-weight="700" fill="#111">tech tutorials</text>
    <rect x="${x + 75}" y="528" width="164" height="15" rx="7" fill="#f6d84a"/>
    <rect x="${x + 75}" y="556" width="280" height="11" rx="5" fill="#111" opacity=".55"/>
    <rect x="${x + 75}" y="584" width="130" height="15" rx="7" fill="#f6d84a"/>
    <rect x="${x + 75}" y="612" width="248" height="11" rx="5" fill="#111" opacity=".55"/>
  </g>`;
}

function sceneSvg(scene: MockScene) {
  const captionLines = lines(scene.text);
  const left = scene.attention !== "right";
  const right = scene.attention !== "left";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
    <rect width="1080" height="1920" fill="#fff"/>
    <rect width="1080" height="38" fill="#f6d84a"/>
    <text x="270" y="205" text-anchor="middle" font-family="Noto Sans,Arial" font-size="54" font-weight="900" fill="#111">BROWSER</text>
    <text x="810" y="205" text-anchor="middle" font-family="Noto Sans,Arial" font-size="54" font-weight="900" fill="#111">SEARCH ENGINE</text>
    <rect x="54" y="245" width="472" height="460" rx="34" fill="#fff" stroke="#111" stroke-width="${left ? 10 : 5}" opacity="${left ? 1 : 0.36}"/>
    <rect x="554" y="245" width="472" height="460" rx="34" fill="#fff" stroke="#111" stroke-width="${right ? 10 : 5}" opacity="${right ? 1 : 0.36}"/>
    ${left ? '<rect x="84" y="266" width="412" height="15" rx="7" fill="#f6d84a"/>' : ""}
    ${right ? '<rect x="584" y="266" width="412" height="15" rx="7" fill="#f6d84a"/>' : ""}
    ${illustration("left", left)}${illustration("right", right)}
    <rect x="95" y="785" width="890" height="${captionLines.length === 1 ? 130 : 210}" rx="34" fill="#f6d84a"/>
    <g>${captionLines.map((line, lineIndex) => `<text x="540" y="${865 + lineIndex * 82}" text-anchor="middle" font-family="Noto Sans,Arial" font-size="64" font-weight="900" fill="#111">${xml(line)}</text>`).join("")}</g>
  </svg>`);
}

export async function normalizeMascotPose(path: string): Promise<Buffer> {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error("Mascot must have an alpha channel");
  let minX = info.width,
    minY = info.height,
    maxX = -1,
    maxY = -1;
  const threshold = 32;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if ((data[(y * info.width + x) * 4 + 3] ?? 0) >= threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
  if (maxX < minX || maxY < minY) throw new Error("Mascot pose is empty");
  const footXs: number[] = [];
  const footBand = maxY - Math.max(12, Math.floor((maxY - minY) * 0.12));
  for (let y = footBand; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++)
      if ((data[(y * info.width + x) * 4 + 3] ?? 0) >= threshold)
        footXs.push(x);
  if (!footXs.length) throw new Error("Mascot foot anchor is missing");
  const footAnchor =
    footXs.reduce((total, value) => total + value, 0) / footXs.length;
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const resized = await sharp(data, { raw: info })
    .extract({ left: minX, top: minY, width: cropWidth, height: cropHeight })
    .resize({ width: 640, height: 580, fit: "inside" })
    .png()
    .toBuffer();
  const metadata = await sharp(resized).metadata();
  if (!metadata.width || !metadata.height)
    throw new Error("Mascot resize failed");
  const anchorAfterResize = ((footAnchor - minX) * metadata.width) / cropWidth;
  const left = Math.round(360 - anchorAfterResize);
  return sharp({
    create: { width: 720, height: 620, channels: 4, background: "#00000000" },
  })
    .composite([{ input: resized, left, top: 620 - metadata.height }])
    .png()
    .toBuffer();
}

async function poseOpacity(input: Buffer, opacity: number): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let index = 3; index < data.length; index += info.channels)
    data[index] = Math.round((data[index] ?? 0) * opacity);
  return sharp(data, { raw: info }).png().toBuffer();
}

export async function renderMock(
  root: string,
  audioPath: string,
  scenes: MockScene[],
  outputDirectory: string,
): Promise<RenderResult> {
  const signal = AbortSignal.timeout(20 * 60 * 1000);
  const assets = await validateAssetPack(root);
  const ownedOutput = resolve(root, "temp-difference");
  if (resolve(outputDirectory) !== ownedOutput)
    throw new Error(
      "Mock renderer may clean only its owned temp-difference output",
    );
  await rm(ownedOutput, { recursive: true, force: true });
  await mkdir(resolve(outputDirectory, "work"), { recursive: true });
  const work = resolve(outputDirectory, "work");
  if (!scenes.length) throw new Error("Mock renderer has no scenes");
  const backgrounds = await Promise.all(
    scenes.map((scene) => sharp(sceneSvg(scene)).png().toBuffer()),
  );
  const normalized = new Map<string, Buffer>();
  for (const scene of scenes) {
    const pose = assets.get(scene.pose);
    if (!pose) throw new Error(`Missing mascot pose: ${scene.pose}`);
    if (!normalized.has(scene.pose))
      normalized.set(scene.pose, await normalizeMascotPose(pose));
  }
  const transitionFrames = 6;
  const variants = new Map<string, Buffer[]>();
  for (const [pose, image] of normalized)
    variants.set(
      pose,
      await Promise.all(
        Array.from({ length: transitionFrames + 1 }, (_, index) =>
          poseOpacity(image, index / transitionFrames),
        ),
      ),
    );
  const silent = resolve(work, "silent.mp4");
  const audioInfo = await probe(audioPath, signal);
  const duration = audioInfo.format.duration;
  const encoder = spawn(
    "ffmpeg",
    [
      "-y",
      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "-framerate",
      "30",
      "-i",
      "pipe:0",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "19",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "30",
      silent,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let encoderError = "";
  encoder.stderr.on("data", (buffer: Buffer) => {
    encoderError = (encoderError + buffer.toString()).slice(-3000);
  });
  const completion = new Promise<void>((resolveCompletion, reject) => {
    encoder.on("error", reject);
    encoder.on("close", (code) =>
      code === 0
        ? resolveCompletion()
        : reject(new Error(`Difference frame encoder failed: ${encoderError}`)),
    );
  });
  completion.catch(() => {});
  const abortEncoder = () => encoder.kill("SIGKILL");
  signal.addEventListener("abort", abortEncoder, { once: true });
  try {
    let sceneIndex = 0;
    for (
      let frameIndex = 0;
      frameIndex < Math.ceil(duration * 30);
      frameIndex++
    ) {
      signal.throwIfAborted();
      const time = frameIndex / 30;
      while (
        sceneIndex < scenes.length - 1 &&
        time >= (scenes[sceneIndex + 1]?.start ?? duration)
      )
        sceneIndex++;
      const scene = scenes[sceneIndex];
      const background = backgrounds[sceneIndex];
      if (!scene || !background) throw new Error("Missing rendered mock scene");
      const currentVariants = variants.get(scene.pose);
      if (!currentVariants)
        throw new Error(`Missing pose variants: ${scene.pose}`);
      const frameWithinTransition = Math.floor((time - scene.start) * 30);
      const previous = scenes[sceneIndex - 1];
      const changingPose = previous && previous.pose !== scene.pose;
      const transitionIndex = Math.min(
        transitionFrames,
        Math.max(0, frameWithinTransition),
      );
      const layers: sharp.OverlayOptions[] = [];
      if (changingPose && transitionIndex < transitionFrames) {
        const previousVariants = variants.get(previous.pose);
        const previousImage =
          previousVariants?.[transitionFrames - transitionIndex];
        const currentImage = currentVariants[transitionIndex];
        if (!previousImage || !currentImage)
          throw new Error("Missing mascot transition frame");
        layers.push(
          { input: previousImage, left: 180, top: 1120 },
          { input: currentImage, left: 180, top: 1120 },
        );
      } else {
        const currentImage = currentVariants[transitionFrames];
        if (!currentImage) throw new Error("Missing mascot frame");
        layers.push({ input: currentImage, left: 180, top: 1120 });
      }
      const frame = await sharp(background).composite(layers).png().toBuffer();
      if (!encoder.stdin.write(frame)) await once(encoder.stdin, "drain");
    }
    encoder.stdin.end();
    await completion;
  } catch (error) {
    encoder.kill("SIGKILL");
    await completion.catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", abortEncoder);
  }
  const videoPath = resolve(
    outputDirectory,
    "browser-vs-search-engine-mock.mp4",
  );
  const bgm = resolve(root, "assets/Bgm.m4a");
  await command(
    "ffmpeg",
    [
      "-y",
      "-i",
      silent,
      "-i",
      audioPath,
      "-stream_loop",
      "-1",
      "-i",
      bgm,
      "-filter_complex",
      `[1:a]loudnorm=I=-16:TP=-1.5:LRA=7,asplit=2[voice][side];[2:a]volume=0.07,afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0, duration - 0.7).toFixed(3)}:d=0.7[music];[music][side]sidechaincompress=threshold=0.02:ratio=8:attack=10:release=280[ducked];[voice][ducked]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.78:level=false[mix]`,
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
      duration.toFixed(3),
      "-movflags",
      "+faststart",
      videoPath,
    ],
    signal,
  );
  const posterPath = resolve(
    outputDirectory,
    "browser-vs-search-engine-poster.png",
  );
  await command(
    "ffmpeg",
    ["-y", "-ss", "2.5", "-i", videoPath, "-frames:v", "1", posterPath],
    signal,
  );
  const info = await probe(videoPath, signal);
  const video = info.streams.find((stream) => stream.codec_type === "video");
  if (
    video?.width !== 1080 ||
    video.height !== 1920 ||
    video.r_frame_rate !== "30/1" ||
    !info.streams.some((stream) => stream.codec_type === "audio") ||
    Math.abs(info.format.duration - duration) > 0.15
  )
    throw new Error("Mock output failed media verification");
  const mix = await measureMix(videoPath, signal);
  if (mix.truePeakDb > -1.2)
    throw new Error(
      `Mock output true peak ${mix.truePeakDb} dB exceeds the -1.2 dB ceiling`,
    );
  const result: RenderResult = {
    videoPath,
    posterPath,
    duration: info.format.duration,
    width: 1080,
    height: 1920,
    fps: 30,
    scenes: scenes.length,
    integratedLufs: mix.integratedLufs,
    truePeakDb: mix.truePeakDb,
  };
  await writeFile(
    resolve(outputDirectory, "result.json"),
    JSON.stringify(
      {
        ...result,
        videoPath: basename(videoPath),
        posterPath: basename(posterPath),
      },
      null,
      2,
    ),
  );
  await rm(work, { recursive: true, force: true });
  return result;
}
