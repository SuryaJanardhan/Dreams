import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { loadConfig, redact } from "./operations/config.js";

async function json(url: string, headers: Record<string, string>) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const value: unknown = await response.json();
      const parsed = z
        .object({
          error: z.union([
            z.string(),
            z.object({ message: z.string().optional() }),
          ]),
        })
        .safeParse(value);
      if (parsed.success)
        detail =
          typeof parsed.data.error === "string"
            ? parsed.data.error
            : (parsed.data.error.message ?? detail);
    } catch {}
    throw new Error(detail);
  }
  return (await response.json()) as unknown;
}
async function paged(
  firstUrl: string,
  headers: Record<string, string>,
  limit = 500,
) {
  const items: unknown[] = [];
  let url: string | undefined = firstUrl;
  while (url && items.length < limit) {
    const value = z
      .object({
        data: z.array(z.unknown()),
        paging: z.object({ next: z.url().optional() }).optional(),
      })
      .parse(await json(url, headers));
    items.push(...value.data);
    url = value.paging?.next;
  }
  return items.slice(0, limit);
}

async function main() {
  const operation = process.argv[2];
  if (!operation || !["inventory", "facebook-rebrand-hide"].includes(operation))
    throw new Error("Expected inventory or facebook-rebrand-hide operation");
  const config = loadConfig();
  if (operation === "facebook-rebrand-hide") {
    await facebookRebrandAndHide(config);
    return;
  }
  const output = {
    createdAt: new Date().toISOString(),
    youtube: {} as unknown,
    instagram: {} as unknown,
    facebook: {} as unknown,
  };
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        refresh_token: config.YOUTUBE_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!tokenResponse.ok) throw new Error("YouTube token refresh failed");
    const token = z
      .object({ access_token: z.string().min(1) })
      .parse((await tokenResponse.json()) as unknown);
    const auth = { Authorization: `Bearer ${token.access_token}` };
    const channels = z
      .object({
        items: z
          .array(
            z.object({
              id: z.string(),
              snippet: z.object({ title: z.string(), description: z.string() }),
              contentDetails: z.object({
                relatedPlaylists: z.object({ uploads: z.string() }),
              }),
            }),
          )
          .min(1),
      })
      .parse(
        await json(
          "https://www.googleapis.com/youtube/v3/channels?part=id,snippet,contentDetails&mine=true",
          auth,
        ),
      );
    const channel = channels.items[0];
    if (!channel) throw new Error("YouTube channel missing");
    const videos: unknown[] = [];
    let pageToken = "";
    do {
      const params = new URLSearchParams({
        part: "snippet,contentDetails,status",
        playlistId: channel.contentDetails.relatedPlaylists.uploads,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      });
      const page = z
        .object({
          items: z.array(z.unknown()),
          nextPageToken: z.string().optional(),
        })
        .parse(
          await json(
            `https://www.googleapis.com/youtube/v3/playlistItems?${params}`,
            auth,
          ),
        );
      videos.push(...page.items);
      pageToken = page.nextPageToken ?? "";
    } while (pageToken && videos.length < 500);
    output.youtube = { channel, videos };
  } catch (error) {
    output.youtube = {
      error: redact(
        error instanceof Error ? error.message : String(error),
        config.secrets,
      ),
    };
  }
  const graph = `https://graph.facebook.com/${config.GRAPH_API_VERSION}`;
  try {
    const headers = {
      Authorization: `Bearer ${config.INSTAGRAM_ACCESS_TOKEN}`,
    };
    const account = await json(
      `${graph}/${config.INSTAGRAM_ACCOUNT_ID}?fields=id,username,name,biography,profile_picture_url,media_count`,
      headers,
    );
    const media = await paged(
      `${graph}/${config.INSTAGRAM_ACCOUNT_ID}/media?fields=id,caption,media_type,permalink,timestamp,thumbnail_url&limit=100`,
      headers,
    );
    output.instagram = { account, media };
  } catch (error) {
    output.instagram = {
      error: redact(
        error instanceof Error ? error.message : String(error),
        config.secrets,
      ),
    };
  }
  try {
    const userHeaders = {
      Authorization: `Bearer ${config.FACEBOOK_ACCESS_TOKEN}`,
    };
    const page = z
      .object({ id: z.string(), access_token: z.string().min(1) })
      .passthrough()
      .parse(
        await json(
          `${graph}/${config.FACEBOOK_PAGE_ID}?fields=id,name,username,about,description,access_token,picture`,
          userHeaders,
        ),
      );
    const pageHeaders = { Authorization: `Bearer ${page.access_token}` };
    const posts = await paged(
      `${graph}/${config.FACEBOOK_PAGE_ID}/feed?fields=id,message,permalink_url,created_time,is_published&limit=100`,
      pageHeaders,
    );
    const videos = await paged(
      `${graph}/${config.FACEBOOK_PAGE_ID}/videos?fields=id,description,permalink_url,created_time,status&limit=100`,
      pageHeaders,
    );
    const { access_token: _token, ...safePage } = page;
    output.facebook = { page: safePage, posts, videos };
  } catch (error) {
    output.facebook = {
      error: redact(
        error instanceof Error ? error.message : String(error),
        config.secrets,
      ),
    };
  }
  const directory = resolve(
    process.cwd(),
    ".social-admin",
    process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, "inventory.json"),
    JSON.stringify(output, null, 2),
  );
  console.log(`Social inventory saved: ${directory}`);
}

async function facebookRebrandAndHide(config: ReturnType<typeof loadConfig>) {
  const graph = `https://graph.facebook.com/${config.GRAPH_API_VERSION}`;
  const userHeaders = {
    Authorization: `Bearer ${config.FACEBOOK_ACCESS_TOKEN}`,
  };
  const page = z
    .object({ id: z.string(), access_token: z.string().min(1) })
    .parse(
      await json(
        `${graph}/${config.FACEBOOK_PAGE_ID}?fields=id,access_token`,
        userHeaders,
      ),
    );
  const results: Record<string, unknown> = {};
  const postForm = async (path: string, values: Record<string, string>) => {
    const response = await fetch(`${graph}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...values, access_token: page.access_token }),
      signal: AbortSignal.timeout(60_000),
    });
    const value: unknown = await response.json();
    if (!response.ok) {
      const detail = z
        .object({ error: z.object({ message: z.string() }) })
        .safeParse(value);
      throw new Error(
        detail.success ? detail.data.error.message : `HTTP ${response.status}`,
      );
    }
    return value;
  };
  for (const [label, values] of [
    [
      "about",
      {
        about:
          "Backend engineering and system design, decoded through clean visual stories.",
        description:
          "Visual explanations of APIs, databases, distributed systems, DevOps, security and software-engineering interview concepts. No fluff—just how the system works.",
      },
    ],
    ["identity", { name: "surya.exe", username: "thesuryaexe" }],
  ] as const)
    try {
      results[label] = await postForm(config.FACEBOOK_PAGE_ID, values);
    } catch (error) {
      results[label] = {
        error: redact(
          error instanceof Error ? error.message : String(error),
          config.secrets,
        ),
      };
    }
  const uploadImage = async (path: string, endpoint: string) => {
    const bytes = await readFile(resolve(config.root, path));
    const form = new FormData();
    form.set(
      "source",
      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      path,
    );
    form.set("access_token", page.access_token);
    const response = await fetch(`${graph}/${endpoint}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    const value: unknown = await response.json();
    if (!response.ok)
      throw new Error(`Image upload failed: ${response.status}`);
    return value;
  };
  try {
    results.profilePicture = await uploadImage(
      "brand/surya-exe/profile-facebook.png",
      `${config.FACEBOOK_PAGE_ID}/picture`,
    );
  } catch (error) {
    results.profilePicture = {
      error: redact(
        error instanceof Error ? error.message : String(error),
        config.secrets,
      ),
    };
  }
  try {
    const uploaded = z
      .object({ id: z.string() })
      .parse(
        await uploadImage(
          "brand/surya-exe/banner-facebook.png",
          `${config.FACEBOOK_PAGE_ID}/photos?published=false`,
        ),
      );
    results.coverUpload = uploaded;
    results.coverSet = await postForm(config.FACEBOOK_PAGE_ID, {
      cover: uploaded.id,
    });
  } catch (error) {
    results.cover = {
      error: redact(
        error instanceof Error ? error.message : String(error),
        config.secrets,
      ),
    };
  }
  const pageHeaders = { Authorization: `Bearer ${page.access_token}` };
  const posts = await paged(
    `${graph}/${config.FACEBOOK_PAGE_ID}/feed?fields=id,is_hidden&limit=100`,
    pageHeaders,
  );
  const hidden: string[] = [];
  const failures: Array<{ id: string; error: string }> = [];
  for (const raw of posts) {
    const parsed = z
      .object({ id: z.string(), is_hidden: z.boolean().optional() })
      .parse(raw);
    if (parsed.is_hidden) {
      hidden.push(parsed.id);
      continue;
    }
    try {
      await postForm(parsed.id, { is_hidden: "true" });
      hidden.push(parsed.id);
    } catch (error) {
      failures.push({
        id: parsed.id,
        error: redact(
          error instanceof Error ? error.message : String(error),
          config.secrets,
        ),
      });
      if (
        failures.length >= 3 &&
        new Set(failures.slice(-3).map((item) => item.error)).size === 1
      )
        break;
    }
  }
  results.posts = { total: posts.length, hidden: hidden.length, failures };
  const directory = resolve(
    process.cwd(),
    ".social-admin",
    process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, "facebook-rebrand-hide.json"),
    JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2),
  );
  console.log(
    `Facebook operation complete: ${hidden.length}/${posts.length} posts hidden; report ${directory}`,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
