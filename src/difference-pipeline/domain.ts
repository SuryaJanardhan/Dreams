export interface CaptionCue {
  start: number;
  end: number;
  text: string;
  group?: number;
}

export type MascotPose =
  | "neutral"
  | "confused"
  | "point-left"
  | "point-right"
  | "compare-both"
  | "idea";

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
