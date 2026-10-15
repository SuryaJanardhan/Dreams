export {};
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    CropTarget?: { fromElement(element: Element): Promise<object> };
    stopRecording?: (() => void) | undefined;
  }
}
