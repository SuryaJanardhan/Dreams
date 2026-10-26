import { z } from "zod";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
const serviceAccount = z.object({
  client_email: z.email(),
  private_key: z.string().min(1),
  project_id: z.string().optional(),
});
const environment = z.object({
  GOOGLE_SHEET_ID: z.string().min(1),
  GOOGLE_CREDENTIALS: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_API_KEY_FOR_VISUALS: z.string().min(1),
  ASSEMBLYAI_API_KEY: z.string().min(1),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_BUCKET: z
    .string()
    .regex(/^[\w-]+$/)
    .default("videos"),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  YOUTUBE_REFRESH_TOKEN: z.string().min(1),
  INSTAGRAM_ACCOUNT_ID: z.string().regex(/^\d+$/),
  INSTAGRAM_ACCESS_TOKEN: z.string().min(1),
  FACEBOOK_PAGE_ID: z.string().regex(/^\d+$/),
  FACEBOOK_ACCESS_TOKEN: z.string().min(1),
  EMAIL_USER: z.email(),
  EMAIL_APP_PASSWORD: z.string().min(1),
  NOTIFICATION_EMAIL: z.email(),
  VOICEBOX_REFERENCE_TEXT: z.string().trim().min(1),
  VOICEBOX_MODEL_SIZE: z.enum(["1.7B", "0.6B"]).default("1.7B"),
  PYTHON_EXECUTABLE: z.string().default("python"),
  SHEET_TAB: z.string().default("Sheet1"),
  GRAPH_API_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default("v23.0"),
  GEMINI_SCRIPT_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_VISUAL_MODEL: z.string().default("gemini-2.5-flash"),
  AUTOMATION_BUDGET_MINUTES: z.coerce
    .number()
    .int()
    .min(20)
    .max(340)
    .default(120),
});
export type Config = z.infer<typeof environment> & {
  credentials: z.infer<typeof serviceAccount>;
  root: string;
  secrets: string[];
};
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  root = process.cwd(),
): Config {
  const transcriptPath = resolve(root, "assets/Base-audio.txt");
  const transcript =
    env.VOICEBOX_REFERENCE_TEXT ||
    (existsSync(transcriptPath)
      ? readFileSync(transcriptPath, "utf8").trim()
      : undefined);
  const parsed = environment.safeParse({
    ...env,
    VOICEBOX_REFERENCE_TEXT: transcript,
  });
  if (!parsed.success)
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    );
  let credentials: z.infer<typeof serviceAccount>;
  try {
    const input: unknown = JSON.parse(parsed.data.GOOGLE_CREDENTIALS);
    credentials = serviceAccount.parse(input);
  } catch {
    throw new Error(
      "GOOGLE_CREDENTIALS must be raw JSON service-account credentials, not base64",
    );
  }
  const keys = [
    "GEMINI_API_KEY",
    "GEMINI_API_KEY_FOR_VISUALS",
    "ASSEMBLYAI_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GOOGLE_CLIENT_SECRET",
    "YOUTUBE_REFRESH_TOKEN",
    "INSTAGRAM_ACCESS_TOKEN",
    "FACEBOOK_ACCESS_TOKEN",
    "EMAIL_APP_PASSWORD",
  ] as const;
  return {
    ...parsed.data,
    credentials,
    root: resolve(root),
    secrets: [...keys.map((key) => parsed.data[key]), credentials.private_key],
  };
}
export function redact(
  text: string,
  secrets: readonly string[],
  limit = 4000,
): string {
  return secrets
    .reduce(
      (result, secret) =>
        secret ? result.split(secret).join("[redacted]") : result,
      text,
    )
    .slice(0, limit);
}

/** Control-plane validation does not require voice/render/publishing credentials. */
export function loadSheetsConfig(env: NodeJS.ProcessEnv = process.env) {
  const minimal = z
    .object({
      GOOGLE_SHEET_ID: z.string().min(1),
      GOOGLE_CREDENTIALS: z.string().min(1),
      SHEET_TAB: z.string().default("Sheet1"),
    })
    .safeParse(env);
  if (!minimal.success)
    throw new Error("Sheets control credentials or Sheet ID missing");
  try {
    const value: unknown = JSON.parse(minimal.data.GOOGLE_CREDENTIALS);
    return { ...minimal.data, credentials: serviceAccount.parse(value) };
  } catch {
    throw new Error(
      "Sheets control credentials must be raw service-account JSON",
    );
  }
}
