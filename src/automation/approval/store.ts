import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import type {
  ApprovalPackage,
  ApprovalStatus,
  ApprovalSummary,
  ContentPlan,
  Progress,
  RenderedVideo,
  Workspace,
} from "../domain.js";
import { Http } from "../operations/http.js";

export interface ApprovalConfig {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_BUCKET: string;
  APPROVAL_TTL_HOURS: number;
}

export interface ReviewRequest {
  approval: ApprovalSummary;
  previewUrl: string;
  reviewUrl: string;
  reminder?: boolean;
}

const videoSchema: z.ZodType<RenderedVideo> = z
  .object({
    path: z.string(),
    duration: z.number().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
    grade: z.number(),
    checks: z
      .object({
        sampledStates: z.number(),
        changingScenes: z.number(),
        integratedLufs: z.number(),
        truePeakDb: z.number(),
        loudnessRange: z.number(),
      })
      .optional(),
  })
  .transform(({ checks, ...video }) => ({
    ...video,
    ...(checks === undefined ? {} : { checks }),
  }));
const planSchema = z.custom<ContentPlan>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as ContentPlan).title === "string" &&
    typeof (value as ContentPlan).narration === "string" &&
    Array.isArray((value as ContentPlan).beats) &&
    typeof (value as ContentPlan).copies === "object",
  "Invalid stored content plan",
);
const progressSchema = z.custom<Progress>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as Progress).jobId === "string" &&
    typeof (value as Progress).task?.row === "number" &&
    Array.isArray((value as Progress).publications),
  "Invalid stored progress",
);
const payloadSchema = z.object({
  progress: progressSchema,
  plan: planSchema,
  video: videoSchema,
});
const rowSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["approved", "rejected"]),
  preview_key: z.string().min(1),
  expires_at: z.string().min(1),
  payload: payloadSchema,
});
const pendingRowSchema = z.object({
  id: z.string().min(1),
  token_hash: z.string().length(64),
  preview_key: z.string().min(1),
  expires_at: z.string().min(1),
  payload: payloadSchema,
});

export class ApprovalStore {
  constructor(
    private readonly config: ApprovalConfig,
    private readonly http: Http,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.config.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: this.config.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    };
  }

  private objectUrl(key: string) {
    return `${this.config.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(this.config.SUPABASE_BUCKET)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  private rest(query = "") {
    return `${this.config.SUPABASE_URL}/rest/v1/approval_requests${query}`;
  }

  private deleteObject(key: string) {
    return this.http.response(
      `${this.config.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(this.config.SUPABASE_BUCKET)}`,
      {
        method: "DELETE",
        headers: this.headers(),
        body: JSON.stringify({ prefixes: [key] }),
      },
    );
  }

  private async signPreview(key: string, seconds: number) {
    const signed = await this.http.json(
      `${this.config.SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(this.config.SUPABASE_BUCKET)}/${key.split("/").map(encodeURIComponent).join("/")}`,
      z.object({ signedURL: z.string().min(1) }),
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ expiresIn: seconds }),
      },
    );
    return new URL(signed.signedURL, this.config.SUPABASE_URL).href;
  }

  async prepare(
    video: RenderedVideo,
    plan: ContentPlan,
    progress: Progress,
  ): Promise<ReviewRequest> {
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const previewKey = `reviews/${progress.jobId}/final.mp4`;
    const expiresAt = new Date(
      this.now().getTime() + this.config.APPROVAL_TTL_HOURS * 3600000,
    ).toISOString();
    await this.http.response(this.objectUrl(previewKey), {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "video/mp4",
        "x-upsert": "false",
      },
      body: await readFile(video.path),
      timeout: 120000,
    });
    const summary: ApprovalSummary = {
      id,
      status: "pending",
      previewKey,
      expiresAt,
    };
    const storedProgress: Progress = {
      ...structuredClone(progress),
      status: "AwaitingApproval",
      stage: "approval",
      lastCompleted: "approval",
      approval: summary,
      remarks:
        "Video generated and quality-checked; secure review delivery is in progress. No social upload has been attempted.",
    };
    try {
      await this.http.response(this.rest(), {
        method: "POST",
        headers: { ...this.headers(), Prefer: "return=minimal" },
        body: JSON.stringify({
          id,
          job_id: progress.jobId,
          task_id: progress.task.id,
          sheet_row: progress.task.row,
          status: "pending",
          token_hash: tokenHash,
          preview_key: previewKey,
          expires_at: expiresAt,
          payload: {
            progress: storedProgress,
            plan,
            video: { ...video, path: "" },
          },
        }),
      });
      return {
        approval: summary,
        previewUrl: await this.signPreview(
          previewKey,
          this.config.APPROVAL_TTL_HOURS * 3600,
        ),
        reviewUrl: `${this.config.SUPABASE_URL}/functions/v1/review-approval?token=${encodeURIComponent(token)}`,
      };
    } catch (error) {
      await Promise.allSettled([
        this.http.response(this.rest(`?id=eq.${encodeURIComponent(id)}`), {
          method: "DELETE",
          headers: this.headers(),
        }),
        this.deleteObject(previewKey),
      ]);
      throw error;
    }
  }

  async revoke(approval: ApprovalSummary): Promise<void> {
    await this.http.response(
      this.rest(
        `?id=eq.${encodeURIComponent(approval.id)}&status=in.(pending,approved,rejected)`,
      ),
      {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify({
          status: "failed",
          updated_at: this.now().toISOString(),
          finished_at: this.now().toISOString(),
          dispatch_error: "Review handoff revoked before safe delivery",
        }),
      },
    );
    await this.deleteObject(approval.previewKey);
  }

  async sendReminder(
    notify: (progress: Progress, request: ReviewRequest) => Promise<void>,
  ): Promise<boolean> {
    const cutoff = new Date(this.now().getTime() - 24 * 3600000).toISOString();
    const candidates = await this.http.json(
      this.rest(
        `?status=eq.pending&reminder_sent_at=is.null&created_at=lte.${encodeURIComponent(cutoff)}&expires_at=gt.${encodeURIComponent(this.now().toISOString())}&select=id,token_hash,preview_key,expires_at,payload&order=created_at.asc&limit=1`,
      ),
      z.array(pendingRowSchema),
      { headers: this.headers() },
    );
    const candidate = candidates[0];
    if (!candidate) return false;
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const changed = await this.http.json(
      this.rest(
        `?id=eq.${encodeURIComponent(candidate.id)}&status=eq.pending&reminder_sent_at=is.null&select=id`,
      ),
      z.array(z.object({ id: z.string() })),
      {
        method: "PATCH",
        headers: { ...this.headers(), Prefer: "return=representation" },
        body: JSON.stringify({
          token_hash: tokenHash,
          reminder_sent_at: this.now().toISOString(),
          updated_at: this.now().toISOString(),
        }),
      },
    );
    if (!changed.length) return false;
    const summary: ApprovalSummary = {
      id: candidate.id,
      status: "pending",
      previewKey: candidate.preview_key,
      expiresAt: candidate.expires_at,
    };
    try {
      const remaining = Math.max(
        60,
        Math.floor(
          (new Date(candidate.expires_at).getTime() - this.now().getTime()) /
            1000,
        ),
      );
      await notify(candidate.payload.progress, {
        approval: summary,
        previewUrl: await this.signPreview(candidate.preview_key, remaining),
        reviewUrl: `${this.config.SUPABASE_URL}/functions/v1/review-approval?token=${encodeURIComponent(token)}`,
        reminder: true,
      });
      return true;
    } catch (error) {
      await this.http.response(
        this.rest(
          `?id=eq.${encodeURIComponent(candidate.id)}&status=eq.pending&token_hash=eq.${tokenHash}`,
        ),
        {
          method: "PATCH",
          headers: this.headers(),
          body: JSON.stringify({
            token_hash: candidate.token_hash,
            reminder_sent_at: null,
            updated_at: this.now().toISOString(),
          }),
        },
      );
      throw error;
    }
  }

  async expireOne(): Promise<
    { progress: Progress; approval: ApprovalSummary } | undefined
  > {
    const candidates = await this.http.json(
      this.rest(
        `?status=eq.pending&expires_at=lte.${encodeURIComponent(this.now().toISOString())}&select=id,token_hash,preview_key,expires_at,payload&order=expires_at.asc&limit=1`,
      ),
      z.array(pendingRowSchema),
      { headers: this.headers() },
    );
    const candidate = candidates[0];
    if (!candidate) return undefined;
    const changed = await this.http.json(
      this.rest(
        `?id=eq.${encodeURIComponent(candidate.id)}&status=eq.pending&select=id`,
      ),
      z.array(z.object({ id: z.string() })),
      {
        method: "PATCH",
        headers: { ...this.headers(), Prefer: "return=representation" },
        body: JSON.stringify({
          status: "expired",
          finished_at: this.now().toISOString(),
          updated_at: this.now().toISOString(),
        }),
      },
    );
    if (!changed.length) return undefined;
    await this.deleteObject(candidate.preview_key);
    return {
      progress: candidate.payload.progress,
      approval: {
        id: candidate.id,
        status: "expired",
        previewKey: candidate.preview_key,
        expiresAt: candidate.expires_at,
      },
    };
  }

  async claim(id?: string): Promise<ApprovalPackage | null> {
    const selection = id
      ? `?id=eq.${encodeURIComponent(id)}&status=in.(approved,rejected)&select=id,status,preview_key,expires_at,payload&limit=1`
      : "?status=in.(approved,rejected)&select=id,status,preview_key,expires_at,payload&order=decided_at.asc&limit=1";
    const candidates = await this.http.json(
      this.rest(selection),
      z.array(rowSchema),
      { headers: this.headers() },
    );
    const candidate = candidates[0];
    if (!candidate) return null;
    const claimed = await this.http.json(
      this.rest(
        `?id=eq.${encodeURIComponent(candidate.id)}&status=eq.${candidate.status}&select=id`,
      ),
      z.array(z.object({ id: z.string() })),
      {
        method: "PATCH",
        headers: { ...this.headers(), Prefer: "return=representation" },
        body: JSON.stringify({
          status: "processing",
          updated_at: this.now().toISOString(),
        }),
      },
    );
    if (!claimed.length) return null;
    return {
      id: candidate.id,
      status: candidate.status as ApprovalStatus,
      previewKey: candidate.preview_key,
      expiresAt: candidate.expires_at,
      ...candidate.payload,
    };
  }

  async download(
    approval: ApprovalPackage,
    workspace: Workspace,
  ): Promise<RenderedVideo> {
    const response = await this.http.response(
      this.objectUrl(approval.previewKey),
      {
        headers: this.headers(),
        timeout: 120000,
      },
    );
    const path = workspace.file("approved-final.mp4");
    await writeFile(path, Buffer.from(await response.arrayBuffer()));
    return { ...approval.video, path };
  }

  async finish(
    approval: ApprovalPackage,
    status: "completed" | "failed" | "rejected",
  ): Promise<string[]> {
    await this.http.response(
      this.rest(`?id=eq.${encodeURIComponent(approval.id)}`),
      {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify({
          status,
          updated_at: this.now().toISOString(),
          finished_at: this.now().toISOString(),
        }),
      },
    );
    await this.deleteObject(approval.previewKey);
    return ["Approval preview removed"];
  }
}
