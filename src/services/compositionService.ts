import { failureInfo } from "../compat/errors.js";
import { chromium } from "playwright";
import path = require("path");
import fs = require("fs");
import ffmpeg = require("fluent-ffmpeg");
import ffmpegPath from "ffmpeg-static";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

const DEFAULT_COMPOSER_URL =
  process.env.REEL_COMPOSER_URL || "http://localhost:3000";
const DEFAULT_COVER_PATH = path.resolve(__dirname, "../../assets/cover.png");

async function applyCoverIntro({
  videoPath,
  coverPath = DEFAULT_COVER_PATH,
}: {
  videoPath: string;
  coverPath?: string;
}) {
  const coverDurationSec = Number(
    process.env.COVER_INTRO_DURATION_SEC || "0.5",
  );
  const delayMs = Math.max(0, Math.round(coverDurationSec * 1000));

  if (!fs.existsSync(coverPath)) {
    throw new Error(
      `CRITICAL: Cover image not found at ${coverPath}. Expected assets/cover.png`,
    );
  }

  const probeInfo = await new Promise<import("fluent-ffmpeg").FfprobeData>(
    (resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    },
  );

  const videoStream = probeInfo.streams.find(
    (s: import("fluent-ffmpeg").FfprobeStream) => s.codec_type === "video",
  );
  if (!videoStream) {
    throw new Error(`No video stream found in ${videoPath}`);
  }

  const hasAudio = probeInfo.streams.some(
    (s: import("fluent-ffmpeg").FfprobeStream) => s.codec_type === "audio",
  );
  const width = videoStream.width || 1080;
  const height = videoStream.height || 1920;
  const outputPath = path.resolve(`FINAL_REEL_COVERED_${Date.now()}.mp4`);

  const filterGraph = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[cover]`,
    `[1:v]setpts=PTS-STARTPTS[mainv]`,
    `[cover][mainv]concat=n=2:v=1:a=0[vout]`,
  ];

  if (hasAudio) {
    filterGraph.push(
      `[1:a]adelay=${delayMs}|${delayMs},asetpts=PTS-STARTPTS[aout]`,
    );
  }

  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg()
      .input(coverPath)
      .inputOptions(["-loop 1", `-t ${coverDurationSec}`])
      .input(videoPath)
      .complexFilter(filterGraph)
      .outputOptions([
        "-y",
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-preset slow",
        "-crf 18",
        "-map [vout]",
      ]);

    if (hasAudio) {
      command = command.outputOptions(["-c:a aac", "-ar 44100", "-map [aout]"]);
    }

    command
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });

  if (!fs.existsSync(outputPath)) {
    throw new Error(
      `Cover-intro render completed but output was not found: ${outputPath}`,
    );
  }

  return {
    coveredVideoPath: outputPath,
    finalVideoPath: videoPath,
  };
}

async function composeFinalReel({
  lipSyncedVideoPath,
  subtitlesPath,
  visualPrompt,
  composerUrl = DEFAULT_COMPOSER_URL,
}: {
  lipSyncedVideoPath: string;
  subtitlesPath: string;
  visualPrompt: string;
  composerUrl?: string;
}) {
  const finalVideoPath = await runCompositor({
    videoPath: lipSyncedVideoPath,
    subtitlesPath,
    visualPrompt,
    composerUrl,
  });

  if (!finalVideoPath) {
    throw new Error("Browser recording failed to produce a file.");
  }

  return {
    finalVideoPath,
    coveredVideoPath: null,
    rawRecordingPath: null,
    composerUrl,
  };
}

async function runCompositor({
  videoPath,
  subtitlesPath,
  visualPrompt,
  composerUrl,
}: {
  videoPath: string;
  subtitlesPath: string;
  visualPrompt: string;
  composerUrl: string;
}) {
  const keys = [
    process.env.GEMINI_API_KEY_FOR_VISUALS,
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_FOR_AUDIO,
    process.env.GEMINI_API_KEY_FOR_T2T,
  ].filter((key): key is string => Boolean(key));
  const uniqueKeys = [...new Set(keys)];

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--auto-select-desktop-capture-source=Entire screen",
      "--auto-select-tab-capture-source-by-title=Reel Composer | AI Director's Studio",
      "--enable-usermedia-screen-capturing",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--disable-dev-shm-usage",
      "--mute-audio",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--window-size=1280,1000",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    acceptDownloads: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  let masterPath = "";
  let complete = false;

  page.on("download", async (dl) => {
    const raw = `raw_tmp_${Date.now()}.mp4`;
    await dl.saveAs(raw);
    await new Promise<void>((r) => setTimeout(r, 3000));
    const finalName = `FINAL_REEL_${Date.now()}.mp4`;
    const out = path.resolve(finalName);
    const audioSrc = path.resolve(videoPath);
    const bgmSrc = findBackgroundMusic();

    console.log(
      "📽️ Final Remuxing (audio offset sync + BGM mixing + high-compatibility settings)...",
    );

    await remuxRecording({ rawRecordingPath: raw, audioSrc, bgmSrc, out });
    if (fs.existsSync(raw)) fs.unlinkSync(raw);
    complete = true;
    masterPath = out;
  });

  try {
    console.log("🌐 Navigating to composer...");
    await page.goto(composerUrl, {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    const pass = page.locator('input[type="password"]');
    await pass.waitFor({ state: "visible", timeout: 30000 }).catch(() => {
      console.log("ℹ️ No password field detected, assuming already logged in.");
    });

    if (await pass.isVisible()) {
      console.log("🔑 Entering API key...");
      for (const key of uniqueKeys) {
        console.log(
          `🔑 Trying API key: ${key.substring(0, 4)}...${key.substring(key.length - 4)}`,
        );
        await pass.fill(key);
        await page.click('button:has-text("Enter Studio")');

        const success = await Promise.race([
          page
            .waitForSelector("#video-upload", {
              state: "attached",
              timeout: 20000,
            })
            .then(() => true)
            .catch(() => false),
          page.waitForTimeout(21000).then(() => false),
        ]);

        if (success) {
          console.log("✅ Login successful.");
          break;
        }
        console.log("❌ Key failed or timed out. Trying next...");
        await pass.clear();
      }
    }

    console.log("📤 Uploading assets...");
    await page
      .waitForSelector("#video-upload", { state: "attached", timeout: 60000 })
      .catch((err: unknown) => {
        const caughtDetails0 = failureInfo(err);

        throw new Error(
          `CRITICAL: Page failed to load #video-upload after login attempts. Error: ${caughtDetails0.message}`,
        );
      });
    await page.setInputFiles("#video-upload", videoPath);
    await page.setInputFiles("#srt-upload", subtitlesPath);
    await page.waitForTimeout(5000);

    console.log("🚀 Advancing to Studio...");
    await page.click('button:has-text("Enter Studio")');
    await page.waitForTimeout(8000);

    console.log("🎨 Filling animation prompt...");
    await page.waitForSelector("textarea", {
      state: "visible",
      timeout: 60000,
    });
    await page.fill("textarea", visualPrompt);

    await page.click('button:has-text("Enter Studio")');

    console.log("⏳ Waiting for generation to complete...");
    let isDone = false;
    for (let i = 1; i <= 10; i++) {
      await page.waitForTimeout(60000);
      console.log(`⏳ Generation wait progress: ${i} minute(s) elapsed...`);

      await page.mouse.move(500 + i, 500 + i);

      const status = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const studioBtn = buttons.find((b) => b.innerText.includes("Studio"));

        const isGenerating =
          studioBtn?.disabled ||
          document.body.innerText.includes("Generating Scene...");
        const v = document.querySelector("video");

        return {
          isGenerating,
          readyState: v ? v.readyState : 0,
          hasVideo: !!v,
        };
      });

      console.log(`📊 Generation Status: ${JSON.stringify(status)}`);
      if (!status.isGenerating && status.readyState >= 2) {
        console.log("✅ Generation complete.");
        isDone = true;
        break;
      }
    }

    if (!isDone) {
      throw new Error(
        "CRITICAL: Visual generation timed out or failed to render in browser (10 minutes). Aborting to avoid black video.",
      );
    }

    console.log("⏳ Looking for Rec & Export button...");
    await page.waitForSelector('button:has-text("Rec & Export")', {
      timeout: 30000,
    });

    const finalCheck = await page.evaluate(() => {
      const v = document.querySelector("video");
      if (!v) return "MISSING";
      if (v.readyState < 2) return "NOT_READY";
      if (v.duration === 0 || isNaN(v.duration)) return "INVALID_DURATION";
      return "OK";
    });

    console.log(`🎬 Final Health Check: ${finalCheck}`);
    if (finalCheck !== "OK") {
      console.warn(
        `⚠️ Warning: Video state is ${finalCheck}. Attempting to force reload src...`,
      );
      await page.evaluate(() => {
        const v = document.querySelector("video");
        if (v) {
          v.load();
          v.play().catch(() => {});
        }
      });
      await page.waitForTimeout(3000);
    }

    console.log("🎬 Initiating Recording...");
    await page.click('button:has-text("Rec & Export")');
    await page.waitForTimeout(5000);
    await page.click('button:has-text("Browser Recorder")');

    const isRecordingStarted = await page
      .waitForSelector('button:has-text("Stop Recording")', { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (!isRecordingStarted) {
      console.warn(
        "⚠️ Recording failed to start automatically. Trying to force play...",
      );
      await page.evaluate(() => {
        const v = document.querySelector("video");
        if (v) v.play();
      });
    }

    console.log("🎥 Monitoring Playback...");
    const begin = Date.now();
    let lastReport = 0;

    while (!complete && Date.now() - begin < 900000) {
      await page.waitForTimeout(5000);

      const stats = await page.evaluate(() => {
        const v = document.querySelector("video");
        return {
          ended: v ? v.ended : false,
          paused: v ? v.paused : true,
          time: v ? v.currentTime : 0,
          duration: v ? v.duration : 0,
        };
      });

      if (Date.now() - lastReport > 15000) {
        console.log(
          `📹 Recording Progress: ${stats.time.toFixed(1)}s / ${stats.duration.toFixed(1)}s (Paused: ${stats.paused}, Ended: ${stats.ended})`,
        );
        lastReport = Date.now();
      }

      if (stats.paused && !stats.ended && stats.time < stats.duration - 1) {
        await page
          .evaluate(() => document.querySelector("video")?.play())
          .catch(() => {});
      }

      if (
        stats.ended ||
        (stats.duration > 0 && stats.time >= stats.duration - 0.5)
      ) {
        console.log(
          "🎞️ Playback reached end. Stopping recording and waiting for download...",
        );
        await page.click('button:has-text("Stop Recording")').catch(() => {
          return page.evaluate(() => {
            if (window.stopRecording) window.stopRecording();
            const btn = Array.from(document.querySelectorAll("button")).find(
              (b) => b.innerText.includes("Stop"),
            );
            if (btn) btn.click();
          });
        });

        const wait = Date.now();
        while (!complete && Date.now() - wait < 300000)
          await page.waitForTimeout(2000);
        break;
      }
    }

    if (!complete) {
      console.error(
        "❌ Recording/Download timed out! Attempting emergency screenshot.",
      );
    }
  } catch (e) {
    const caughtDetails1 = failureInfo(e);

    console.error("Browser Automation Error:", caughtDetails1.message);
    const screenshotPath = `error_screenshot_${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Error screenshot saved: ${screenshotPath}`);
    throw e;
  } finally {
    await browser.close();
  }
  return masterPath;
}

function findBackgroundMusic() {
  const bgmExtensions = [".mp3", ".m4a", ".wav"];
  const bgmNames = ["bgm", "Bgm", "BGM"];

  for (const name of bgmNames) {
    for (const ext of bgmExtensions) {
      const potentialPath = path.resolve(
        __dirname,
        `../../assets/${name}${ext}`,
      );
      if (fs.existsSync(potentialPath)) {
        console.log(`🎵 Found BGM: ${path.basename(potentialPath)}`);
        return potentialPath;
      }
    }
  }

  return null;
}

function remuxRecording({
  rawRecordingPath,
  audioSrc,
  bgmSrc,
  out,
}: {
  rawRecordingPath: string;
  audioSrc: string;
  bgmSrc: string | null;
  out: string;
}) {
  return new Promise((res, rej) => {
    let command = ffmpeg(rawRecordingPath).input(audioSrc);
    const hasBgm = !!bgmSrc;

    if (hasBgm) {
      command = command.input(bgmSrc).inputOptions(["-stream_loop -1"]);
    }

    const filterComplex: import("fluent-ffmpeg").FilterSpecification[] = [
      {
        filter: "adelay",
        options: "400|400",
        inputs: "1:a",
        outputs: "delayed",
      },
    ];

    if (hasBgm) {
      filterComplex.push({
        filter: "volume",
        options: "0.2",
        inputs: "2:a",
        outputs: "lowBgm",
      });
      filterComplex.push({
        filter: "amix",
        options: { inputs: 2, dropout_transition: 0, normalize: 0 },
        inputs: ["delayed", "lowBgm"],
        outputs: "mixed",
      });
    } else {
      const firstFilter = filterComplex[0];
      if (firstFilter) firstFilter.outputs = "mixed";
    }

    command
      .complexFilter(filterComplex)
      .outputOptions([
        "-y",
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-preset slow",
        "-crf 18",
        "-profile:v main",
        "-level:v 4.1",
        "-r 30",
        "-c:a aac",
        "-ar 44100",
        "-map 0:v:0",
        "-map [mixed]",
        "-shortest",
        "-movflags +faststart",
      ])
      .output(out)
      .on("end", res)
      .on("error", rej)
      .run();
  });
}

export = {
  applyCoverIntro,
  composeFinalReel,
};
