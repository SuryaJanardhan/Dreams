import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, basename } from "node:path";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { failureInfo } from "../src/compat/errors.js";
import { present, truthy } from "../src/compat/guards.js";
import { generateCompatibility } from "../scripts/generate-compat.js";
function stable(value: unknown): unknown {
  if (value instanceof Error) return { message: value.message };
  if (Array.isArray(value)) return Array.from(value, stable);
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, stable(item)]),
    );
  return value;
}
async function orchestration(
  source: string,
  typescript: boolean,
  failVoice = false,
) {
  const events: { name: string; args: unknown }[] = [];
  const task = { rowId: 2, sno: 1, idea: "API", description: "Example" };
  const record =
    (name: string, result: unknown) =>
    (...args: unknown[]) => {
      events.push({ name, args: stable(args) });
      return result;
    };
  const modules: Record<string, unknown> = {
    sheetsService: {
      claimNextTask: record("claim", Promise.resolve(task)),
      markTaskProcessing: record("processing", Promise.resolve()),
      markTaskFailed: record("failed", Promise.resolve()),
      markTaskPosted: record("posted", Promise.resolve()),
    },
    scriptService: {
      generateScriptForTask: record(
        "script",
        Promise.resolve({ script: "An API request", provider: "gemini" }),
      ),
      generateVisualPromptForTask: record(
        "visual-plan",
        Promise.resolve({ visualPrompt: "Request travels" }),
      ),
    },
    audioService: {
      generateNarrationAudio: (...args: unknown[]) => {
        events.push({ name: "voice", args: stable(args) });
        if (failVoice) throw new Error("Voice fixture failed");
        return Promise.resolve({ audioPath: "audio.wav" });
      },
      prepareAudioForComposition: (value: { audioPath: string }) =>
        value.audioPath,
    },
    wav2lipService: {
      createLipSyncedVideo: record(
        "lip-sync",
        Promise.resolve({ videoPath: "lip.mp4" }),
      ),
    },
    subtitles: {
      createSubtitleTrack: record(
        "captions",
        Promise.resolve({
          subtitlesPath: "captions.srt",
          transcript: "Request",
        }),
      ),
    },
    compositionService: {
      composeFinalReel: record(
        "render",
        Promise.resolve({ finalVideoPath: "final.mp4" }),
      ),
      applyCoverIntro: record(
        "cover",
        Promise.resolve({
          coveredVideoPath: "covered.mp4",
          finalVideoPath: "final.mp4",
        }),
      ),
    },
    publishingService: {
      generatePublishingCaption: record(
        "caption",
        Promise.resolve({ caption: "Shared caption" }),
      ),
      publishReel: record(
        "publish",
        Promise.resolve({
          success: true,
          successCount: 3,
          links: { yt: "yt", insta: "ig", fb: "fb" },
          staging: { success: true, fileName: "job.mp4" },
        }),
      ),
      cleanupPublishingStaging: record("clean-staging", Promise.resolve()),
    },
    emailService: {
      notifySuccess: record("success-email", Promise.resolve()),
      notifyFailure: record("failure-email", Promise.resolve()),
    },
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {},
    },
    errors: { failureInfo },
    guards: { present, truthy },
  };
  const filesystem = {
    existsSync: () => false,
    writeFileSync: record("write", undefined),
    copyFileSync: record("copy", undefined),
    unlinkSync: record("unlink", undefined),
    mkdirSync: () => {},
  };
  const requireFake = (id: string): unknown => {
    if (id === "fs") return filesystem;
    if (id === "path") return path;
    if (id === "dotenv") return { config: () => ({}) };
    if (id === "groq-sdk") return class {};
    const key = basename(id).replace(/\.js$/, "");
    if (!(key in modules)) throw new Error("Unmocked dependency " + id);
    return modules[key];
  };
  class Clock extends Date {
    constructor(value?: string | number) {
      super(value ?? 1700000000000);
    }
    static override now() {
      return 1700000000000;
    }
  }
  const code = typescript
    ? ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
          useDefineForClassFields: false,
        },
      }).outputText
    : source;
  const module = { exports: {} };
  const result: unknown = runInNewContext(
    code,
    {
      require: requireFake,
      module,
      exports: module.exports,
      __filename: resolve("src/main_automation.js"),
      __dirname: resolve("src"),
      process: { env: {}, exitCode: 0 },
      console: { log: () => {}, error: () => {} },
      Date: Clock,
      setTimeout,
      clearTimeout,
      Buffer,
    },
    { timeout: 3000 },
  );
  await result;
  return events;
}
for (const failure of [false, true])
  test(`legacy orchestration preserves ${failure ? "failure" : "success"} stage and side-effect order`, async () => {
    const old = await readFile(
      resolve("tests/fixtures/legacy-main.txt"),
      "utf8",
    );
    const current = await readFile(resolve("src/main_automation.ts"), "utf8");
    const currentEvents = await orchestration(current, true, failure);
    assert.ok(
      currentEvents.some(
        (event) => event.name === (failure ? "failure-email" : "success-email"),
      ),
    );
    assert.equal(
      currentEvents.some((event) => event.name === "publish"),
      !failure,
    );
    assert.deepEqual(currentEvents, await orchestration(old, false, failure));
  });
test("plain Node compatibility imports preserve object exports, cache identity and utility results", () => {
  const program = `const a=require('./src/utils/textCleaner.js');const b=require('./src/utils/textCleaner.ts');if(a!==b)throw Error('Duplicate module instance');if(a.cleanText('**hello** world')!=='hello world')throw Error('Text changed');const theme=require('./src/config/styles.js').getDayBasedTheme();if(!theme.primary)throw Error('Theme export changed');console.log('compatibility-ok');`;
  assert.match(
    execFileSync(process.execPath, ["-e", program], {
      cwd: process.cwd(),
      encoding: "utf8",
    }),
    /compatibility-ok/,
  );
});
test("compatibility generation refuses to overwrite authored source", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "dreams-compat-"));
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(resolve(root, "docs"));
    await mkdir(resolve(root, "bin"));
    await writeFile(
      resolve(root, "docs/typescript-migration-files.json"),
      JSON.stringify([{ source: "bin/task.js", target: "bin/task.ts" }]),
    );
    await writeFile(resolve(root, "bin/task.ts"), "export {};");
    await writeFile(resolve(root, "bin/task.js"), "// user work");
    await assert.rejects(
      generateCompatibility(root),
      /Refusing to overwrite authored code/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a guarded CLI runs through its old JavaScript path but not when imported", async () => {
  const root = await mkdtemp(resolve(process.cwd(), ".migration-cli-"));
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(resolve(root, "docs"));
    await mkdir(resolve(root, "bin"));
    await writeFile(
      resolve(root, "docs/typescript-migration-files.json"),
      JSON.stringify([{ source: "bin/task.js", target: "bin/task.ts" }]),
    );
    await writeFile(
      resolve(root, "bin/task.ts"),
      `import {isMain} from ${JSON.stringify(resolve("src/compat/entry.ts"))};if(isMain(module,__filename))console.log('guarded-entry');export const value=42;`,
    );
    assert.equal(await generateCompatibility(root), 1);
    assert.equal(
      execFileSync(process.execPath, [resolve(root, "bin/task.js")], {
        encoding: "utf8",
      }).trim(),
      "guarded-entry",
    );
    assert.equal(
      execFileSync(
        process.execPath,
        [
          "-e",
          `console.log(require(${JSON.stringify(resolve(root, "bin/task.js"))}).value)`,
        ],
        { encoding: "utf8" },
      ).trim(),
      "42",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy notification aliases and partial-failure email HTML match the existing user edits", async () => {
  async function notification(source: string, typed: boolean) {
    const messages: unknown[] = [];
    const module = { exports: {} };
    const loader = (id: string): unknown => {
      if (id === "nodemailer")
        return {
          createTransport: () => ({
            sendMail: async (message: unknown) => {
              messages.push(stable(message));
            },
          }),
        };
      if (id === "fs") return { existsSync: () => false };
      if (id === "path") return path;
      if (id.includes("logger"))
        return {
          info: () => {},
          error: () => {},
          warn: () => {},
          debug: () => {},
        };
      if (id.includes("compat/errors")) return { failureInfo };
      if (id.includes("compat/guards"))
        return {
          record: (value: unknown) =>
            typeof value === "object" && value !== null,
        };
      throw new Error("Unmocked notification dependency " + id);
    };
    class Clock extends Date {
      constructor() {
        super(1700000000000);
      }
    }
    const code = typed
      ? ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            esModuleInterop: true,
          },
        }).outputText
      : source;
    runInNewContext(
      code,
      {
        require: loader,
        module,
        exports: module.exports,
        process: {
          env: {
            EMAIL_USER: "fixture@example.com",
            NOTIFICATION_EMAIL: "recipient@example.com",
          },
        },
        console,
        Date: Clock,
        __dirname: resolve("src/services"),
      },
      { timeout: 3000 },
    );
    const exports: unknown = module.exports;
    if (
      typeof exports !== "object" ||
      exports === null ||
      !("notifySuccess" in exports) ||
      !("notifyFailure" in exports) ||
      typeof exports.notifySuccess !== "function" ||
      typeof exports.notifyFailure !== "function"
    )
      throw new Error("Notification export shape changed");
    const task = { idea: "API", description: "Example", sno: 1 };
    await exports.notifySuccess({
      task,
      links: {
        yt: "https://example.org/youtube",
        insta: "https://example.org/instagram",
        fb: "https://example.org/facebook",
      },
    });
    await exports.notifyFailure({
      task,
      error: Object.assign(new Error("Provider rejected upload"), {
        stack: "Error: Provider rejected upload\n    at fixture",
        results: { youtubeUrl: "https://example.org/already-published" },
      }),
      step: "publishing",
    });
    return messages;
  }
  const original = await readFile("tests/fixtures/legacy-email.txt", "utf8");
  const migrated = await readFile("src/services/emailService.ts", "utf8");
  const oldMessages = await notification(original, false),
    newMessages = await notification(migrated, true);
  assert.equal(newMessages.length, 2);
  assert.deepEqual(newMessages, oldMessages);
});
