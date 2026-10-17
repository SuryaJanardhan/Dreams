import type { CaptionCue, MascotPose, MockScene } from "./domain.js";

function seconds(value: string): number {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) throw new Error(`Invalid caption timestamp: ${value}`);
  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
  );
}

export function parseVtt(source: string): CaptionCue[] {
  const blocks = source.replaceAll("\r", "").trim().split(/\n\n+/);
  const cues: CaptionCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes(" --> "));
    if (timingIndex < 0) continue;
    const [from, to] = lines[timingIndex]?.split(" --> ") ?? [];
    if (!from || !to) throw new Error("Caption timing is incomplete");
    const text = lines
      .slice(timingIndex + 1)
      .join(" ")
      .trim();
    if (!text) throw new Error("Caption cue has no text");
    cues.push({ start: seconds(from), end: seconds(to), text });
  }
  if (!cues.length) throw new Error("No caption cues found");
  return cues;
}

function chunkSizes(total: number): number[] {
  if (total <= 6) return [total];
  const chunks = Math.ceil(total / 6);
  const base = Math.floor(total / chunks);
  const remainder = total % chunks;
  return Array.from(
    { length: chunks },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

/** Split provider sentence cues into short phrases while preserving their real time window. */
export function splitCaptionCues(cues: CaptionCue[]): CaptionCue[] {
  return cues.flatMap((cue, group) => {
    const words = cue.text.trim().split(/\s+/);
    const sizes = chunkSizes(words.length);
    const duration = cue.end - cue.start;
    let wordOffset = 0;
    return sizes.map((size) => {
      const from = wordOffset;
      const to = wordOffset + size;
      wordOffset = to;
      return {
        start: cue.start + (duration * from) / words.length,
        end: cue.start + (duration * to) / words.length,
        text: words.slice(from, to).join(" "),
        group,
      };
    });
  });
}

const poses: MascotPose[] = [
  "confused",
  "point-left",
  "neutral",
  "point-right",
  "compare-both",
  "idea",
];

export function buildMockTimeline(
  cues: CaptionCue[],
  duration: number,
): MockScene[] {
  if (duration <= 0) throw new Error("Narration duration must be positive");
  return cues.map((cue, index) => {
    const start = index === 0 ? 0 : cue.start;
    const end = cues[index + 1]?.start ?? duration;
    if (end <= start || end > duration + 0.2)
      throw new Error("Caption cues do not form a valid narration timeline");
    const group = cue.group ?? index;
    const attention =
      group === 1 || group === 2
        ? ("left" as const)
        : group === 3
          ? ("right" as const)
          : ("both" as const);
    return {
      start,
      end: Math.min(end, duration),
      text: cue.text,
      pose: poses[group] ?? "idea",
      attention,
    };
  });
}
