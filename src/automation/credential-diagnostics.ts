import "dotenv/config";
import nodemailer from "nodemailer";
import { google } from "googleapis";
import { z } from "zod";
import { loadConfig, redact } from "./operations/config.js";

interface CheckResult {
  provider: string;
  status: "passed" | "failed";
  detail: string;
}
function errorDetail(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (!cause || typeof cause !== "object") return error.message;
  const parsed = z
    .object({ code: z.string().optional(), message: z.string().optional() })
    .safeParse(cause);
  if (!parsed.success) return error.message;
  const detail = [parsed.data.code, parsed.data.message]
    .filter(Boolean)
    .join(": ");
  return detail ? `${error.message} (${detail})` : error.message;
}

async function response(url: string, init: RequestInit = {}, timeout = 30_000) {
  const result = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeout),
  });
  if (!result.ok) {
    let detail = `${result.status} ${result.statusText}`;
    try {
      const body: unknown = await result.json();
      const parsed = z
        .object({
          error: z.union([
            z.string(),
            z.object({
              message: z.string().optional(),
              error_user_msg: z.string().optional(),
            }),
          ]),
        })
        .safeParse(body);
      if (parsed.success)
        detail =
          typeof parsed.data.error === "string"
            ? parsed.data.error
            : (parsed.data.error.error_user_msg ??
              parsed.data.error.message ??
              detail);
    } catch {}
    throw new Error(detail.slice(0, 500));
  }
  return result;
}

async function main() {
  const config = loadConfig();
  const checks: Array<{
    provider: string;
    run(): Promise<string>;
  }> = [
    {
      provider: "Google Sheets",
      async run() {
        const auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: config.credentials.client_email,
            private_key: config.credentials.private_key,
          },
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        const token = await auth.getAccessToken();
        if (!token) throw new Error("No service-account access token returned");
        const result = await response(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.GOOGLE_SHEET_ID)}?fields=spreadsheetId,properties.title`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const value: unknown = await result.json();
        const sheet = z
          .object({
            spreadsheetId: z.string(),
            properties: z.object({ title: z.string() }),
          })
          .parse(value);
        return `readable sheet: ${sheet.properties.title}`;
      },
    },
    ...[
      ["Gemini script", config.GEMINI_API_KEY, config.GEMINI_SCRIPT_MODEL],
      [
        "Gemini visuals",
        config.GEMINI_API_KEY_FOR_VISUALS,
        config.GEMINI_VISUAL_MODEL,
      ],
    ].map(([provider, key, model]) => ({
      provider: provider ?? "Gemini",
      async run() {
        const result = await response(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model ?? "")}:generateContent`,
          {
            method: "POST",
            headers: {
              "x-goog-api-key": key ?? "",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: "Return only OK" }] }],
              generationConfig: { maxOutputTokens: 8 },
            }),
          },
          60_000,
        );
        const value: unknown = await result.json();
        z.object({ candidates: z.array(z.unknown()).min(1) }).parse(value);
        return `model accepted: ${model}`;
      },
    })),
    {
      provider: "AssemblyAI",
      async run() {
        const result = await response(
          "https://api.assemblyai.com/v2/transcript?limit=1",
          { headers: { authorization: config.ASSEMBLYAI_API_KEY } },
        );
        const value: unknown = await result.json();
        z.object({ transcripts: z.array(z.unknown()) })
          .passthrough()
          .parse(value);
        return "API key accepted";
      },
    },
    {
      provider: "Supabase",
      async run() {
        const result = await response(
          `${config.SUPABASE_URL}/storage/v1/bucket/${encodeURIComponent(config.SUPABASE_BUCKET)}`,
          {
            headers: {
              Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
              apikey: config.SUPABASE_SERVICE_ROLE_KEY,
            },
          },
        );
        const value: unknown = await result.json();
        const bucket = z
          .object({ name: z.string(), public: z.boolean() })
          .passthrough()
          .parse(value);
        if (!bucket.public)
          throw new Error(`Bucket ${bucket.name} exists but is not public`);
        return `public bucket available: ${bucket.name}`;
      },
    },
    {
      provider: "YouTube",
      async run() {
        const tokenResult = await response(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: config.GOOGLE_CLIENT_ID,
              client_secret: config.GOOGLE_CLIENT_SECRET,
              refresh_token: config.YOUTUBE_REFRESH_TOKEN,
              grant_type: "refresh_token",
            }),
          },
        );
        const tokenValue: unknown = await tokenResult.json();
        const token = z
          .object({ access_token: z.string().min(1) })
          .parse(tokenValue);
        const tokenInfoResult = await response(
          `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token.access_token)}`,
        );
        const tokenInfoValue: unknown = await tokenInfoResult.json();
        const tokenInfo = z.object({ scope: z.string() }).parse(tokenInfoValue);
        const scopes = new Set(tokenInfo.scope.split(/\s+/));
        if (
          ![
            "https://www.googleapis.com/auth/youtube.upload",
            "https://www.googleapis.com/auth/youtube",
            "https://www.googleapis.com/auth/youtube.force-ssl",
          ].some((scope) => scopes.has(scope))
        )
          throw new Error("Refresh token lacks a YouTube upload-capable scope");
        return "refresh token accepted with upload-capable scope";
      },
    },
    {
      provider: "Instagram",
      async run() {
        const result = await response(
          `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${encodeURIComponent(config.INSTAGRAM_ACCOUNT_ID)}?fields=id,username`,
          {
            headers: {
              Authorization: `Bearer ${config.INSTAGRAM_ACCESS_TOKEN}`,
            },
          },
        );
        const value: unknown = await result.json();
        const account = z
          .object({ id: z.string(), username: z.string().optional() })
          .parse(value);
        return `account readable: ${account.username ?? account.id}`;
      },
    },
    {
      provider: "Facebook",
      async run() {
        const result = await response(
          `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${encodeURIComponent(config.FACEBOOK_PAGE_ID)}?fields=id,name,access_token`,
          {
            headers: {
              Authorization: `Bearer ${config.FACEBOOK_ACCESS_TOKEN}`,
            },
          },
        );
        const value: unknown = await result.json();
        const page = z
          .object({
            id: z.string(),
            name: z.string().optional(),
            access_token: z.string().min(1),
          })
          .parse(value);
        return `page token available: ${page.name ?? page.id}`;
      },
    },
    {
      provider: "Gmail SMTP",
      async run() {
        const transport = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: config.EMAIL_USER,
            pass: config.EMAIL_APP_PASSWORD,
          },
          connectionTimeout: 20_000,
          socketTimeout: 30_000,
        });
        await transport.verify();
        transport.close();
        return `authentication accepted for ${config.EMAIL_USER}`;
      },
    },
  ];
  const results: CheckResult[] = [];
  for (const check of checks)
    try {
      results.push({
        provider: check.provider,
        status: "passed",
        detail: await check.run(),
      });
    } catch (error) {
      results.push({
        provider: check.provider,
        status: "failed",
        detail: redact(errorDetail(error), config.secrets),
      });
    }
  for (const result of results)
    console.log(
      `${result.status === "passed" ? "PASS" : "FAIL"}\t${result.provider}\t${result.detail}`,
    );
  const failed = results.filter((result) => result.status === "failed");
  if (failed.length) {
    console.error(
      `Credential diagnostics failed for ${failed.length} provider(s)`,
    );
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
