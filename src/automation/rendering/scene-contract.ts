import type { gsap } from "gsap";
export interface SceneContext {
  root: HTMLElement;
  timeline: gsap.core.Timeline;
  width: number;
  height: number;
  duration: number;
  words: readonly { text: string; start: number; end: number }[];
}
export interface Scene {
  dispose(): void;
}
export type CreateScene = (context: SceneContext) => Scene;
