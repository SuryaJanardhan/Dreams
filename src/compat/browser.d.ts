import type { gsap } from "gsap";
export {};
declare global {
  interface Window {
    gsap?: typeof gsap;
    mainTimeline?: gsap.core.Timeline;
    tl?: gsap.core.Timeline;
    stopRecording?: () => void;
  }
}
