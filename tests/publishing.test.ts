import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { writeFile } from "node:fs/promises";
import { Publisher } from "../src/automation/publishing/index.js";
import { Http, type Request } from "../src/automation/operations/http.js";
import { loadConfig } from "../src/automation/operations/config.js";
import { createWorkspace } from "../src/automation/workspace/index.js";
import type { Publication } from "../src/automation/domain.js";
const config = loadConfig({
  GOOGLE_CREDENTIALS: JSON.stringify({
    client_email: "test@example.com",
    private_key: "fixture",
  }),
  GOOGLE_SHEET_ID: "fixture",
  GEMINI_API_KEY: "fixture",
  GEMINI_API_KEY_FOR_VISUALS: "fixture",
  ASSEMBLYAI_API_KEY: "fixture",
  SUPABASE_URL: "https://storage.example.org",
  SUPABASE_SERVICE_ROLE_KEY: "fixture",
  GOOGLE_CLIENT_ID: "fixture",
  GOOGLE_CLIENT_SECRET: "fixture",
  YOUTUBE_REFRESH_TOKEN: "fixture",
  INSTAGRAM_ACCOUNT_ID: "123",
  INSTAGRAM_ACCESS_TOKEN: "fixture",
  FACEBOOK_PAGE_ID: "456",
  FACEBOOK_ACCESS_TOKEN: "fixture",
  EMAIL_USER: "test@example.com",
  EMAIL_APP_PASSWORD: "fixture",
  NOTIFICATION_EMAIL: "test@example.com",
  VOICEBOX_REFERENCE_TEXT: "Test reference",
});
class ProviderFixture extends Http {
  calls: { url: string; request: Request }[] = [];
  constructor(
    readonly failInstagram = false,
    readonly pendingInstagram = false,
  ) {
    super(() => new AbortController().signal);
  }
  override async response(url: string, request: Request = {}) {
    this.calls.push({ url, request });
    return new Response("{}", {
      status: 200,
      headers: { location: "https://www.googleapis.com/upload/session-1" },
    });
  }
  override async json<T>(
    url: string,
    schema: z.ZodType<T>,
    request: Request = {},
  ): Promise<T> {
    this.calls.push({ url, request });
    let value: unknown;
    if (url.includes("oauth2")) value = { access_token: "fixture" };
    else if (url.includes("upload/session")) value = { id: "yt-1" };
    else if (url.includes("youtube/v3/videos?"))
      value = {
        items: [
          {
            id: "yt-1",
            status: { uploadStatus: "processed", privacyStatus: "public" },
          },
        ],
      };
    else if (url.endsWith("/123/media")) {
      if (this.failInstagram) throw new Error("IG rejected");
      value = { id: "container-1" };
    } else if (url.includes("container-1?")) {
      if (this.pendingInstagram)
        throw new Error("Provider verification timed out");
      value = { status_code: "FINISHED" };
    } else if (url.endsWith("/123/media_publish")) value = { id: "ig-1" };
    else if (url.includes("ig-1?"))
      value = {
        id: "ig-1",
        permalink: "https://www.instagram.com/reel/canonical-code/",
      };
    else if (url.includes("/456?")) value = { access_token: "fixture" };
    else if (url.endsWith("/456/videos")) value = { id: "fb-1" };
    else if (url.includes("fb-1?"))
      value = {
        id: "fb-1",
        permalink_url: "/page/videos/fb-1/",
        status: { video_status: "ready" },
      };
    else throw new Error(`Unexpected fixture provider request ${url}`);
    return schema.parse(value);
  }
  override async poll<T>(operation: () => Promise<T | undefined>): Promise<T> {
    const value = await operation();
    if (value === undefined) throw new Error("Fixture not ready");
    return value;
  }
}
async function fixture(http: ProviderFixture) {
  const workspace = await createWorkspace(
    process.cwd(),
    `publishing-${Date.now()}`,
  );
  const path = workspace.file("final.mp4");
  await writeFile(path, "fixture");
  return {
    workspace,
    publisher: new Publisher(config, http),
    video: {
      path,
      duration: 60,
      width: 1080,
      height: 1920,
      fps: 60,
      grade: 100,
    },
    plan: {
      title: "API",
      narration: "script",
      caption: "ONE SHARED CAPTION",
      beats: [],
      grade: 100,
    },
  };
}
test("publishing uses one shared caption and provider permalinks, never a numeric Instagram ID as a link", async () => {
  const http = new ProviderFixture();
  const { workspace, publisher, video, plan } = await fixture(http);
  const results: Publication[] = [];
  try {
    await publisher.publish(video, plan, workspace, async (result) => {
      results.push(result);
    });
    assert.equal(
      results.filter((result) => result.state === "Published").length,
      3,
    );
    assert.ok(
      results.some(
        (result) =>
          result.state === "Published" &&
          result.url === "https://www.instagram.com/reel/canonical-code/",
      ),
    );
    const bodies = http.calls
      .filter(
        (call) => call.request.body && typeof call.request.body === "string",
      )
      .map((call) => String(call.request.body));
    assert.equal(
      bodies.filter((body) => body.includes("ONE SHARED CAPTION")).length,
      3,
    );
    await publisher.cleanup();
    assert.equal(
      http.calls.filter((call) => call.request.method === "DELETE").length,
      1,
    );
  } finally {
    await workspace.cleanup();
  }
});
test("an unverified Instagram consumer does not prevent Facebook attempt or allow unsafe staging deletion", async () => {
  const http = new ProviderFixture(false, true);
  const { workspace, publisher, video, plan } = await fixture(http);
  const results: Publication[] = [];
  try {
    await publisher.publish(video, plan, workspace, async (result) => {
      results.push(result);
    });
    assert.ok(
      results.some(
        (result) =>
          result.platform === "facebook" && result.state === "Published",
      ),
    );
    assert.ok(
      results.some(
        (result) =>
          result.platform === "instagram" && result.state === "Unknown",
      ),
    );
    await assert.rejects(publisher.cleanup(), /provider may still be fetching/);
    assert.equal(
      http.calls.filter((call) => call.url.endsWith("/123/media_publish"))
        .length,
      0,
    );
  } finally {
    await workspace.cleanup();
  }
});
