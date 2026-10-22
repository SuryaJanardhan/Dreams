import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { chromium } from "playwright";
import puppeteer from "puppeteer";

async function main() {
  const root = process.cwd();
  const work = await mkdtemp(resolve(tmpdir(), "dreams-smoke-"));
  const children: ChildProcess[] = [];
  let logs = "";
  async function port(): Promise<number> {
    const server = createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const result = address.port;
    await new Promise<void>((done) => server.close(() => done()));
    return result;
  }
  function start(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      logs += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      logs += chunk.toString();
    });
    children.push(child);
    return child;
  }
  async function ready(url: string, child: ChildProcess) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null)
        throw new Error(`Smoke server exited: ${logs}`);
      try {
        if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok)
          return;
      } catch {}
      await new Promise((done) => setTimeout(done, 200));
    }
    throw new Error(`Smoke server did not start: ${logs}`);
  }
  try {
    const serverPort = await port();
    const base = `http://127.0.0.1:${serverPort}`;
    const server = start(
      [
        "--import",
        resolve(root, "node_modules/tsx/dist/loader.mjs"),
        resolve(root, "test/server.ts"),
      ],
      work,
      {
        PORT: String(serverPort),
        SUPABASE_URL: "https://storage.example.invalid",
        SUPABASE_SERVICE_ROLE_KEY: "offline-fixture",
        GOOGLE_CREDENTIALS: "{}",
        GEMINI_API_KEY: "offline-fixture",
        GROQ_API_KEY: "offline-fixture",
      },
    );
    await ready(`${base}/health`, server);
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(
      await health.json().then((value: unknown) => {
        assert.ok(
          typeof value === "object" &&
            value !== null &&
            "status" in value &&
            "version" in value,
        );
        return { status: value.status, version: value.version };
      }),
      { status: "healthy", version: "2.0.0" },
    );
    for (const route of ["script", "audio", "images"]) {
      const response = await fetch(`${base}/${route}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      assert.equal(response.status, 400, `${route} invalid-input contract`);
    }
    assert.equal((await fetch(`${base}/workflow/status`)).status, 200);
    assert.equal((await fetch(`${base}/unknown-smoke-route`)).status, 404);
    console.log(
      "Legacy server: startup, health, status, validation and 404 passed.",
    );

    const video = resolve(work, "fixture.mp4"),
      srt = resolve(work, "fixture.srt");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=180x320:r=30:d=3",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-y",
      video,
    ]);
    await writeFile(
      srt,
      "1\n00:00:00,000 --> 00:00:02,500\nMigration smoke fixture.\n",
    );
    const editorPort = await port();
    const editorBase = `http://127.0.0.1:${editorPort}`;
    const editor = start(
      [
        resolve(root, "reel-composer/node_modules/vite/bin/vite.js"),
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        String(editorPort),
        "--strictPort",
      ],
      resolve(root, "reel-composer"),
    );
    await ready(editorBase, editor);
    const executablePath =
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      (existsSync("/usr/bin/google-chrome")
        ? "/usr/bin/google-chrome"
        : undefined);
    const browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
    try {
      const page = await browser.newPage({
        permissions: ["clipboard-read", "clipboard-write"],
        viewport: { width: 1280, height: 900 },
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const gsap = await readFile(
        resolve(root, "node_modules/gsap/dist/gsap.min.js"),
      );
      await page.route("**/*", async (route) => {
        const url = route.request().url();
        if (
          url.startsWith(editorBase) ||
          url.startsWith("blob:") ||
          url.startsWith("data:")
        )
          await route.continue();
        else if (/gsap(?:\.min)?\.js/.test(url))
          await route.fulfill({
            contentType: "application/javascript",
            body: gsap,
          });
        else await route.abort();
      });
      await page.goto(editorBase);
      await page
        .getByRole("button", { name: "Or enter manual mode (No AI features)" })
        .click();
      await page.locator("#video-upload").setInputFiles(video);
      await page.locator('input[accept=".srt"]').setInputFiles(srt);
      await page
        .getByRole("button", { name: "Enter Studio", exact: true })
        .click();
      await page
        .getByRole("button", { name: "No API Key - Enter Manual Mode" })
        .click();
      await page.getByRole("button", { name: "Play", exact: true }).click();
      await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.getByRole("button", { name: "HTML", exact: true }).click();
      await page
        .locator("textarea:visible")
        .fill("<html><body><h1>Migration smoke</h1></body></html>");
      await page.getByRole("button", { name: "Apply Changes" }).click();
      await page
        .frameLocator('iframe[title="Generated Animation"]')
        .getByRole("heading", { name: "Migration smoke" })
        .waitFor();
      await page.getByRole("button", { name: "Layout", exact: true }).click();
      await page.getByRole("button", { name: "Apply Changes" }).click();
      await page.getByRole("button", { name: "Rec & Export" }).click();
      await page.getByRole("heading", { name: "Export Unavailable" }).waitFor();
      assert.deepEqual(errors, [], "Editor browser exceptions");
      console.log(
        "Composer: video/SRT upload, manual entry, play/pause, HTML/layout editing and export capability dialog passed.",
      );
    } finally {
      await browser.close();
    }
    const legacyBrowser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath ?? chromium.executablePath(),
      args: ["--no-sandbox"],
    });
    try {
      const page = await legacyBrowser.newPage();
      await page.setViewport({ width: 180, height: 320 });
      await page.setContent("<h1>Puppeteer smoke</h1>", { waitUntil: "load" });
      await page.waitForNetworkIdle();
      assert.ok((await page.screenshot()).byteLength > 0);
      console.log(
        "Legacy Puppeteer: launch, viewport, content, network idle and screenshot passed.",
      );
    } finally {
      await legacyBrowser.close();
    }
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
      await exited;
      clearTimeout(timer);
    }
    await rm(work, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
