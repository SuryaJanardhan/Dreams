export interface CaptionCue {
  start: number;
  end: number;
  text: string;
  role?: BeatRole;
}

export type BeatRole =
  | "hook"
  | "concept-a"
  | "concept-a-example"
  | "concept-b"
  | "scenario"
  | "memory-rule";

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

export type MascotPose =
  | "neutral"
  | "confused"
  | "point-left"
  | "point-right"
  | "compare-both"
  | "idea"
  | "thinking"
  | "warning"
  | "phone"
  | "laptop"
  | "thumbs-up"
  | "conclusion";

export interface MockScene extends CaptionCue {
  pose: MascotPose;
  attention: "both" | "left" | "right";
}

export interface RenderResult {
  videoPath: string;
  posterPath: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  scenes: number;
  integratedLufs: number;
  truePeakDb: number;
}
