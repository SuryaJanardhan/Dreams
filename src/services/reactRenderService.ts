import { failureInfo } from "../compat/errors.js";
import puppeteer = require("puppeteer");
import ffmpeg = require("fluent-ffmpeg");
import ffmpegPath from "ffmpeg-static";
import path = require("path");
import fs = require("fs");
import { spawn } from "child_process";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Start Vite dev server and wait for it to be ready
 */
const startDevServer = async (projectDir: string) => {
  return new Promise<{
    process: import("child_process").ChildProcessWithoutNullStreams;
    url: string;
    external?: boolean;
  }>((resolve, reject) => {
    console.log("Starting Vite dev server...");

    const viteProcess = spawn("npm", ["run", "dev"], {
      cwd: projectDir,
      shell: true,
      stdio: "pipe",
    });

    viteProcess.stdout.on("data", (data) => {
      const output = data.toString();
      console.log("Vite:", output.trim());

      // Check if server is ready - Vite outputs "Local:" when ready
      if (output.includes("ready in") || output.includes("Local:")) {
        // Extract port from output
        const urlMatch = output.match(/http:\/\/localhost:(\d+)/);
        if (urlMatch) {
          const url = `http://localhost:${urlMatch[1]}`;
          console.log(`Server detected at ${url}`);
          setTimeout(() => resolve({ process: viteProcess, url }), 2000);
        } else {
          // Default to 5173
          setTimeout(
            () =>
              resolve({ process: viteProcess, url: "http://localhost:5173" }),
            2000,
          );
        }
      }
    });

    viteProcess.stderr.on("data", (data) => {
      console.error("Vite Error:", data.toString());
    });

    viteProcess.on("error", reject);

    // Timeout after 30 seconds
    setTimeout(() => reject(new Error("Vite server failed to start")), 30000);
  });
};

/**
 * Save generated HTML to bridge file for React to consume
 */
const saveContentBridge = (
  htmlContent: string,
  scriptContent: string,
  srtContent: string,
) => {
  const bridgeDir = path.resolve(__dirname, "../../bridge");
  if (!fs.existsSync(bridgeDir)) fs.mkdirSync(bridgeDir, { recursive: true });

  const bridgeData = {
    html: htmlContent,
    script: scriptContent || "",
    srt: srtContent || "",
    timestamp: Date.now(),
  };

  const bridgePath = path.join(bridgeDir, "content.json");
  fs.writeFileSync(bridgePath, JSON.stringify(bridgeData, null, 2));
  console.log("Content saved to bridge:", bridgePath);

  return bridgePath;
};

/**
 * Render frames from React app running on dev server
 */
const renderFramesFromReactApp = async (
  reactAppUrl: string,
  outputDir: string,
  duration: number,
  fps = 15,
) => {
  console.log(`Rendering from React app at ${reactAppUrl}...`);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: false,
    channel: "chrome", // Use system Chrome for reliability
  });

  const page = await browser.newPage();
  page.on("console", (msg) => console.log("BROWSER:", msg.text()));

  await page.setViewport({ width: 1080, height: 1920 });

  try {
    console.log(`Navigating to ${reactAppUrl}...`);
    await page.goto(reactAppUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    console.log("Page loaded!");
  } catch (err) {
    const caughtDetails0 = failureInfo(err);

    console.error("Navigation failed:", caughtDetails0.message);
    await browser.close();
    throw new Error(`Failed to load ${reactAppUrl}: ${caughtDetails0.message}`);
  }

  // Wait for React to load and render content
  await new Promise<void>((r) => setTimeout(r, 3000));

  const status = await page.evaluate(() => {
    return {
      gsap: typeof window.gsap !== "undefined",
      ready: document.readyState,
      elements: document.body.getElementsByTagName("*").length,
    };
  });

  console.log("React App Status:", status);

  const totalFrames = Math.ceil(duration * fps);
  console.log(`Recording ${totalFrames} frames...`);

  for (let i = 0; i < totalFrames; i++) {
    const time = i / fps;

    // Send time update to React app
    await page.evaluate((t) => {
      window.postMessage({ type: "timeupdate", time: t }, "*");
    }, time);

    await new Promise<void>((r) => setTimeout(r, 16)); // Frame delay

    const pad = i.toString().padStart(5, "0");
    const framePath = path.join(outputDir, `frame_${pad}.png`);

    await page.screenshot({
      path: framePath,
      omitBackground: true,
    });

    if (i % 10 === 0) console.log(`Frame ${i}/${totalFrames}`);
  }

  await browser.close();
  console.log("Recording complete!");
};

/**
 * Composite frames with base video and audio
 */
const compositeFramesWithVideo = async (
  baseVideo: string,
  framesDir: string,
  audioPath: string,
  finalPath: string,
  fps = 15,
) => {
  console.log(`Compositing -> ${finalPath}`);
  return new Promise<string>((resolve, reject) => {
    ffmpeg()
      .input(baseVideo)
      .input(path.join(framesDir, "frame_%05d.png"))
      .inputOptions([`-framerate ${fps}`])
      .input(audioPath)
      .complexFilter([
        "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[base]",
        "[1:v]format=rgba,scale=1080:1920[overlay]",
        "[base][overlay]overlay=0:0:format=auto[outv]",
      ])
      .outputOptions([
        "-map [outv]",
        "-map 2:a",
        "-c:v libx264",
        "-c:a aac",
        "-shortest",
        "-pix_fmt yuv420p",
      ])
      .output(finalPath)
      .on("end", () => {
        console.log("✅ Composite finished!");
        resolve(finalPath);
      })
      .on("error", (err) => {
        console.error("Composite error:", err);
        reject(err);
      })
      .run();
  });
};

export = {
  startDevServer,
  saveContentBridge,
  renderFramesFromReactApp,
  compositeFramesWithVideo,
};
