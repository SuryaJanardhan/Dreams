export const platforms = ["youtube", "instagram", "facebook"] as const;
export type Platform = (typeof platforms)[number];
export const stages = [
  "initialization",
  "research",
  "content",
  "visual-planning",
  "assets",
  "voice",
  "captions",
  "rendering",
  "quality",
  "approval",
  "publishing",
  "cleanup",
] as const;
export type Stage = (typeof stages)[number];
export type JobStatus =
  | "Processing"
  | "AwaitingApproval"
  | "ApprovalExpired"
  | "Rejected"
  | "Completed"
  | "Failed"
  | "Partial"
  | "Cancelled"
  | "Interrupted";
export interface Task {
  id: string;
  row: number;
  idea: string;
  description: string;
  narration: string;
  type: ContentType | "";
  audience: string;
  sourceUrls: string[];
}
export const contentTypes = [
  "question",
  "comparison",
  "interview",
  "scenario",
] as const;
export type ContentType = (typeof contentTypes)[number];
export interface SourceLink {
  url: string;
  title: string;
}
export interface ResearchPacket {
  mode: "primary-evidence" | "gemini-best-effort";
  summary: string;
  sources: SourceLink[];
}
export interface Beat {
  id: string;
  text: string;
  purpose: string;
}
export interface PublicationCopy {
  title: string;
  description: string;
}
export interface ContentPlan {
  type: ContentType;
  title: string;
  narration: string;
  beats: Beat[];
  copies: Record<Platform, PublicationCopy>;
  research: ResearchPacket;
  grade: number;
}
export interface Narration {
  peakRssMb?: number;
  path: string;
  duration: number;
  sampleRate: number;
}
export interface Word {
  text: string;
  start: number;
  end: number;
}
export interface TimedBeat extends Beat {
  start: number;
  end: number;
}
export interface CaptionTrack {
  words: Word[];
  beats: TimedBeat[];
  duration: number;
}
export type SemanticColor =
  "structure" | "active" | "success" | "warning" | "failure";
export interface VisualBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type PrimitiveKind =
  | "label"
  | "code-card"
  | "table"
  | "database"
  | "file"
  | "queue"
  | "service"
  | "server"
  | "server-cluster"
  | "cache"
  | "load-balancer"
  | "cloud"
  | "token"
  | "repository"
  | "pipeline"
  | "container"
  | "virtual-machine"
  | "terminal"
  | "phone"
  | "decision"
  | "client"
  | "browser"
  | "api"
  | "lock"
  | "badge"
  | "counter"
  | "image"
  | "composite";
export interface VisualObject {
  id: string;
  kind: PrimitiveKind;
  label: string;
  semantic: SemanticColor;
  box: VisualBox;
  detail?: string | undefined;
  rows?: string[][] | undefined;
  assetId?: string | undefined;
  primitiveId?: string | undefined;
}
export type TransitionOperation =
  | "create"
  | "reveal"
  | "draw"
  | "transfer"
  | "mutate"
  | "compare"
  | "annotate"
  | "focus"
  | "dim"
  | "remove"
  | "settle"
  | "reflow"
  | "row-insert"
  | "queue-advance"
  | "lock"
  | "unlock"
  | "fail"
  | "succeed"
  | "highlight-code"
  | "expire"
  | "branch";
export type MotionPreset =
  | "soft-enter"
  | "draw-path"
  | "travel-path"
  | "state-change"
  | "internal-action"
  | "rearrange"
  | "focus"
  | "settle"
  | "soft-exit";
export interface TimelineAction {
  id: string;
  beatId: string;
  action: TransitionOperation;
  objectIds: string[];
  anchor: string;
  value?: string | undefined;
  motion: MotionPreset;
  layout?: Array<{ objectId: string; box: VisualBox }> | undefined;
}
export interface PrimitiveSpec {
  id: string;
  label: string;
  shapes: Array<{
    kind: "rect" | "circle" | "line" | "path" | "text";
    x: number;
    y: number;
    width?: number | undefined;
    height?: number | undefined;
    text?: string | undefined;
    semantic: SemanticColor;
  }>;
}
export interface AssetIntent {
  id: string;
  query: string;
  purpose: string;
  requiredFeatures: string[];
  sourcePreference: "official-first";
}
export interface CameraAction {
  id: string;
  beatId: string;
  action: "frame" | "pan" | "push-in" | "pull-out" | "follow" | "return-wide";
  objectIds: string[];
  anchor: string;
  zoom: number;
}
export interface VisualStory {
  version: 2;
  world: VisualObject[];
  timeline: TimelineAction[];
  camera: CameraAction[];
  assetIntents: AssetIntent[];
  proposedPrimitives: PrimitiveSpec[];
}
export type VisualPlan = VisualStory;
export interface ValidatedAsset {
  id: string;
  path: string;
  sourcePage: string;
  sourceUrl: string;
  width: number;
  height: number;
}
export interface RenderedVideo {
  checks?: {
    sampledStates: number;
    changingScenes: number;
    integratedLufs: number;
    truePeakDb: number;
    loudnessRange: number;
  };
  path: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  grade: number;
}
export type ApprovalStatus = "approved" | "rejected";
export interface ApprovalSummary {
  id: string;
  status: "pending" | "expired" | ApprovalStatus;
  previewKey: string;
  expiresAt: string;
}
export interface ApprovalPackage extends ApprovalSummary {
  status: ApprovalStatus;
  progress: Progress;
  plan: ContentPlan;
  video: RenderedVideo;
}
export type Publication =
  | { platform: Platform; state: "Published"; id: string; url: string }
  | {
      platform: Platform;
      state: "Failed" | "Unknown" | "NotAttempted";
      detail: string;
      id?: string;
      url?: string;
    };
export interface PublicationJournal {
  staging: {
    key: string;
    state: "Planned" | "Ready" | "Deleted";
    consumers: Platform[];
  } | null;
  operations: {
    platform: Platform;
    phase: "upload" | "container" | "publish";
    state: "Intent" | "Accepted";
    id?: string;
  }[];
}
export interface Finalization {
  cleanup: "passed" | "failed";
  persistence: "passed" | "failed";
  pause: "not-required" | "saved" | "failed";
  notification: "pending" | "sent" | "failed";
}
export interface Progress {
  jobId: string;
  task: Task;
  status: JobStatus;
  stage: Stage;
  lastCompleted: Stage | null;
  startedAt: string;
  updatedAt: string;
  publications: Publication[];
  remarks: string;
  cleanup: string[];
  grades: Record<string, number>;
  metrics?: Record<string, number>;
  sources?: SourceLink[];
  primitiveReviews?: Array<{
    id: string;
    status: "pending" | "promoted" | "rejected";
    artifact?: string | undefined;
    spec: PrimitiveSpec;
  }>;
  primitiveReviewUrl?: string | undefined;
  journal?: PublicationJournal;
  finalization?: Finalization;
  approval?: ApprovalSummary;
}
export type Outcome =
  | { state: "NoWork" | "Paused"; detail: string }
  | {
      state:
        | "AwaitingApproval"
        | "ApprovalExpired"
        | "Rejected"
        | "Completed"
        | "Failed"
        | "Partial"
        | "Cancelled"
        | "Interrupted";
      progress: Progress;
      notification: string;
      operationalSuccess: boolean;
    };
export interface Workspace {
  path: string;
  file(name: string): string;
  cleanup(): Promise<string[]>;
}
export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function initialPublications(): Publication[] {
  return platforms.map((platform) => ({
    platform,
    state: "NotAttempted",
    detail: "Publishing has not started",
  }));
}
