import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
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
  if (process.argv[2] !== "inventory")
    throw new Error("Expected explicit inventory operation");
  const config = loadConfig();
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

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
