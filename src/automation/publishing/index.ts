import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import type { Config } from "../operations/config.js";
import { Http, HttpError } from "../operations/http.js";
import type {
  ContentPlan,
  Platform,
  Publication,
  PublicationJournal,
  RenderedVideo,
  Workspace,
} from "../domain.js";
import { message } from "../domain.js";
const idSchema = z.object({ id: z.string().min(1) });
class PersistenceError extends Error {}
class PublicationError extends Error {
  constructor(
    detail: string,
    readonly outcome: Publication,
  ) {
    super(detail);
  }
}
export function publicationFailure(
  platform: Platform,
  error: unknown,
): Publication {
  return error instanceof PublicationError
    ? error.outcome
    : { platform, state: "Failed", detail: message(error) };
}
/** One submission per platform. Verification reads may poll; no submission is blindly repeated. */
export class Publisher {
  private staging: string | undefined;
  private journal: PublicationJournal = { staging: null, operations: [] };
  private persist: (journal: PublicationJournal) => Promise<void> =
    async () => {};
  private async checkpoint() {
    if (this.journal.staging)
      this.journal.staging.consumers = [...this.pendingConsumers];
    try {
      await this.persist(structuredClone(this.journal));
    } catch (error) {
      throw new PersistenceError(
        `Publication journal could not be saved: ${message(error)}`,
      );
    }
  }
  private async intent(
    platform: Platform,
    phase: "upload" | "container" | "publish",
  ) {
    this.journal.operations.push({ platform, phase, state: "Intent" });
    await this.checkpoint();
  }
  private async accepted(
    platform: Platform,
    phase: "upload" | "container" | "publish",
    id: string,
  ) {
    const operation = [...this.journal.operations]
      .reverse()
      .find((item) => item.platform === platform && item.phase === phase);
    if (!operation) throw new Error("Missing persisted publication intent");
    operation.state = "Accepted";
    operation.id = id;
    await this.checkpoint();
  }
  private readonly pendingConsumers = new Set<Platform>();
  constructor(
    private readonly config: Config,
    private readonly http: Http,
  ) {}
  private get graph() {
    return `https://graph.facebook.com/${this.config.GRAPH_API_VERSION}`;
  }
  private token(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }
  private async stage(video: RenderedVideo, workspace: Workspace) {
    const key = `${basename(workspace.path)}/final.mp4`;
    this.staging = key;
    this.journal.staging = { key, state: "Planned", consumers: [] };
    await this.checkpoint();
    const bytes = await readFile(video.path);
    await this.http.response(
      `${this.config.SUPABASE_URL}/storage/v1/object/${this.config.SUPABASE_BUCKET}/${key}`,
      {
        method: "POST",
        headers: {
          ...this.token(this.config.SUPABASE_SERVICE_ROLE_KEY),
          apikey: this.config.SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "video/mp4",
          "x-upsert": "false",
        },
        body: new Blob([new Uint8Array(bytes)]),
        timeout: 180000,
      },
    );
    this.journal.staging.state = "Ready";
    await this.checkpoint();
    return `${this.config.SUPABASE_URL}/storage/v1/object/public/${this.config.SUPABASE_BUCKET}/${key}`;
  }
  async publish(
    video: RenderedVideo,
    plan: ContentPlan,
    workspace: Workspace,
    record: (result: Publication) => Promise<void>,
    journal: (snapshot: PublicationJournal) => Promise<void> = async () => {},
  ) {
    this.persist = journal;
    let staging: string | undefined;
    let stagingError = "";
    try {
      staging = await this.stage(video, workspace);
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      stagingError = message(error);
    }
    let persistenceError: unknown;
    for (const platform of ["youtube", "instagram", "facebook"] as const) {
      let result: Publication;
      try {
        if (platform === "youtube")
          result = await this.youtube(video, plan, record);
        else if (!staging)
          result = {
            platform,
            state: "NotAttempted",
            detail: `Staging unavailable: ${stagingError}`,
          };
        else
          result =
            platform === "instagram"
              ? await this.instagram(staging, plan, record)
              : await this.facebook(staging, plan, record);
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        result = publicationFailure(platform, error);
      }
      // When result persistence fails do not start another remote side effect. Otherwise finish all targets.
      try {
        await record(result);
      } catch (error) {
        persistenceError = error;
        break;
      }
    }
    if (persistenceError) throw persistenceError;
  }
  private async youtube(
    video: RenderedVideo,
    plan: ContentPlan,
    record: (result: Publication) => Promise<void>,
  ): Promise<Publication> {
    const token = await this.http.json(
      "https://oauth2.googleapis.com/token",
      z.object({ access_token: z.string().min(1) }),
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.config.GOOGLE_CLIENT_ID,
          client_secret: this.config.GOOGLE_CLIENT_SECRET,
          refresh_token: this.config.YOUTUBE_REFRESH_TOKEN,
          grant_type: "refresh_token",
        }),
      },
    );
    const auth = this.token(token.access_token);
    let id: string | undefined;
    let submitted = false;
    try {
      const session = await this.http.response(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          method: "POST",
          headers: auth,
          body: JSON.stringify({
            snippet: {
              title: plan.title,
              description: plan.caption,
              categoryId: "27",
            },
            status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
          }),
        },
      );
      const location = session.headers.get("location");
      if (!location || new URL(location).hostname !== "www.googleapis.com")
        throw new Error("Invalid YouTube upload session URL");
      const bytes = await readFile(video.path);
      await this.intent("youtube", "upload");
      submitted = true;
      const upload = await this.http.json(location, idSchema, {
        method: "PUT",
        headers: { ...auth, "Content-Type": "video/mp4" },
        body: new Blob([new Uint8Array(bytes)]),
        timeout: 180000,
      });
      id = upload.id;
      await this.accepted("youtube", "upload", id);
      const url = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
      await record({
        platform: "youtube",
        state: "Unknown",
        id,
        url,
        detail: "Upload accepted; processing verification pending",
      });
      const verified = await this.http.poll(
        async () => {
          const result = await this.http.json(
            `https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${encodeURIComponent(id ?? "")}`,
            z.object({
              items: z.array(
                z.object({
                  id: z.string(),
                  status: z.object({
                    uploadStatus: z.string(),
                    privacyStatus: z.string(),
                  }),
                  processingDetails: z
                    .object({ processingStatus: z.string() })
                    .optional(),
                }),
              ),
            }),
            { headers: auth },
          );
          const item = result.items.find((item) => item.id === id);
          if (
            item &&
            ["failed", "rejected", "deleted"].includes(item.status.uploadStatus)
          )
            throw new PublicationError("YouTube rejected publication", {
              platform: "youtube",
              state: "Failed",
              id: item.id,
              url,
              detail: `YouTube ${item.status.uploadStatus}`,
            });
          return item &&
            (item.status.uploadStatus === "processed" ||
              item.processingDetails?.processingStatus === "succeeded") &&
            item.status.privacyStatus === "public"
            ? item
            : undefined;
        },
        5000,
        120,
      );
      return { platform: "youtube", state: "Published", id: verified.id, url };
    } catch (error) {
      if (
        error instanceof PublicationError ||
        error instanceof PersistenceError
      )
        throw error;
      throw new PublicationError(message(error), {
        platform: "youtube",
        state: submitted ? "Unknown" : "Failed",
        detail: message(error),
        ...(id ? { id, url: `https://www.youtube.com/watch?v=${id}` } : {}),
      });
    }
  }
  private async instagram(
    url: string,
    plan: ContentPlan,
    record: (result: Publication) => Promise<void>,
  ): Promise<Publication> {
    const auth = this.token(this.config.INSTAGRAM_ACCESS_TOKEN);
    let container: string | undefined;
    let published: string | undefined;
    let submitted = false;
    try {
      this.pendingConsumers.add("instagram");
      await this.intent("instagram", "container");
      submitted = true;
      const created = await this.http.json(
        `${this.graph}/${this.config.INSTAGRAM_ACCOUNT_ID}/media`,
        idSchema,
        {
          method: "POST",
          headers: auth,
          body: JSON.stringify({
            media_type: "REELS",
            video_url: url,
            caption: plan.caption,
            thumb_offset: 250,
          }),
        },
      );
      container = created.id;
      await this.accepted("instagram", "container", container);
      await record({
        platform: "instagram",
        state: "Unknown",
        id: container,
        detail: "Media container accepted; not yet published",
      });
      await this.http.poll(
        async () => {
          const status = await this.http.json(
            `${this.graph}/${container}?fields=status_code`,
            z.object({ status_code: z.string() }),
            { headers: auth },
          );
          if (["ERROR", "EXPIRED"].includes(status.status_code)) {
            this.pendingConsumers.delete("instagram");
            await this.checkpoint();
            throw new PublicationError("Instagram media processing failed", {
              platform: "instagram",
              state: "Failed",
              id: container ?? "",
              detail: `Container ${status.status_code}`,
            });
          }
          if (
            status.status_code === "FINISHED" ||
            status.status_code === "PUBLISHED"
          ) {
            this.pendingConsumers.delete("instagram");
            await this.checkpoint();
            return status;
          }
          return undefined;
        },
        5000,
        120,
      );
      await this.intent("instagram", "publish");
      const result = await this.http.json(
        `${this.graph}/${this.config.INSTAGRAM_ACCOUNT_ID}/media_publish`,
        idSchema,
        {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ creation_id: container }),
        },
      );
      published = result.id;
      await this.accepted("instagram", "publish", published);
      await record({
        platform: "instagram",
        state: "Unknown",
        id: published,
        detail: "Publish accepted; canonical permalink verification pending",
      });
      const item = await this.http.poll(
        async () => {
          const item = await this.http.json(
            `${this.graph}/${published}?fields=id,permalink,media_type`,
            z.object({
              id: z.string(),
              permalink: z.url().optional(),
              media_type: z.string().optional(),
            }),
            { headers: auth },
          );
          return item.id === published && item.permalink ? item : undefined;
        },
        5000,
        60,
      );
      if (!item.permalink)
        throw new Error("Instagram did not supply a canonical permalink");
      return {
        platform: "instagram",
        state: "Published",
        id: item.id,
        url: item.permalink,
      };
    } catch (error) {
      if (
        error instanceof PublicationError ||
        error instanceof PersistenceError
      )
        throw error;
      const rejected =
        !container &&
        error instanceof HttpError &&
        [400, 401, 403, 404, 413, 422, 429].includes(error.status);
      if (rejected) {
        this.pendingConsumers.delete("instagram");
        await this.checkpoint();
      }
      throw new PublicationError(message(error), {
        platform: "instagram",
        state: submitted && !rejected ? "Unknown" : "Failed",
        detail: message(error),
        ...((published ?? container)
          ? { id: published ?? container ?? "" }
          : {}),
      });
    }
  }
  private async facebook(
    url: string,
    plan: ContentPlan,
    record: (result: Publication) => Promise<void>,
  ): Promise<Publication> {
    const page = await this.http.json(
      `${this.graph}/${this.config.FACEBOOK_PAGE_ID}?fields=access_token`,
      z.object({ access_token: z.string().min(1) }),
      { headers: this.token(this.config.FACEBOOK_ACCESS_TOKEN) },
    );
    const auth = this.token(page.access_token);
    let id: string | undefined;
    let submitted = false;
    try {
      this.pendingConsumers.add("facebook");
      await this.intent("facebook", "upload");
      submitted = true;
      const result = await this.http.json(
        `${this.graph}/${this.config.FACEBOOK_PAGE_ID}/videos`,
        idSchema,
        {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ file_url: url, description: plan.caption }),
        },
      );
      id = result.id;
      await this.accepted("facebook", "upload", id);
      await record({
        platform: "facebook",
        state: "Unknown",
        id,
        detail: "Video accepted; published/ready verification pending",
      });
      const ready = await this.http.poll(
        async () => {
          const item = await this.http.json(
            `${this.graph}/${id}?fields=id,status,permalink_url`,
            z.object({
              id: z.string(),
              permalink_url: z.string().optional(),
              status: z.object({
                video_status: z.string(),
                publishing_phase: z.object({ status: z.string() }).optional(),
              }),
            }),
            { headers: auth },
          );
          if (["error", "failed"].includes(item.status.video_status)) {
            this.pendingConsumers.delete("facebook");
            await this.checkpoint();
            throw new PublicationError("Facebook processing failed", {
              platform: "facebook",
              state: "Failed",
              id: item.id,
              detail: "Facebook video processing failed",
            });
          }
          if (item.status.video_status === "ready") {
            this.pendingConsumers.delete("facebook");
            await this.checkpoint();
            return item.permalink_url ? item : undefined;
          }
          return undefined;
        },
        5000,
        120,
      );
      const permalink = new URL(
        ready.permalink_url ?? "",
        "https://www.facebook.com",
      ).href;
      if (
        new URL(permalink).hostname !== "www.facebook.com" &&
        new URL(permalink).hostname !== "facebook.com"
      )
        throw new Error("Invalid Facebook canonical link");
      return {
        platform: "facebook",
        state: "Published",
        id: ready.id,
        url: permalink,
      };
    } catch (error) {
      if (
        error instanceof PublicationError ||
        error instanceof PersistenceError
      )
        throw error;
      const rejected =
        !id &&
        error instanceof HttpError &&
        [400, 401, 403, 404, 413, 422, 429].includes(error.status);
      if (rejected) {
        this.pendingConsumers.delete("facebook");
        await this.checkpoint();
      }
      throw new PublicationError(message(error), {
        platform: "facebook",
        state: submitted && !rejected ? "Unknown" : "Failed",
        detail: message(error),
        ...(id ? { id } : {}),
      });
    }
  }
  async cleanup(): Promise<string[]> {
    if (!this.staging) return ["No Supabase staging object created"];
    if (this.pendingConsumers.size)
      throw new Error(
        `Staging retained: a provider may still be fetching ${this.staging}; inspect and remove after processing ends`,
      );
    await this.http.response(
      `${this.config.SUPABASE_URL}/storage/v1/object/${this.config.SUPABASE_BUCKET}`,
      {
        method: "DELETE",
        headers: {
          ...this.token(this.config.SUPABASE_SERVICE_ROLE_KEY),
          apikey: this.config.SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ prefixes: [this.staging] }),
      },
    );
    if (this.journal.staging) this.journal.staging.state = "Deleted";
    await this.checkpoint();
    this.staging = undefined;
    return ["Supabase staging removed; existing social publications preserved"];
  }
}
