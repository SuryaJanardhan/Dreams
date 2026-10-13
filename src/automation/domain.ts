export const platforms = ["youtube", "instagram", "facebook"] as const;
export type Platform = (typeof platforms)[number];
export type Stage =
  | "initialization"
  | "content"
  | "voice"
  | "captions"
  | "rendering"
  | "publishing"
  | "cleanup";
export type JobStatus =
  | "Processing"
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
}
export interface Beat {
  id: string;
  text: string;
  visual: string;
}
export interface ContentPlan {
  title: string;
  narration: string;
  beats: Beat[];
  caption: string;
  grade: number;
}
export interface Narration {
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
export interface RenderedVideo {
  path: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  grade: number;
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
}
export type Outcome =
  | { state: "NoWork" | "Paused"; detail: string }
  | {
      state: "Completed" | "Failed" | "Partial" | "Cancelled" | "Interrupted";
      progress: Progress;
      notification: string;
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
