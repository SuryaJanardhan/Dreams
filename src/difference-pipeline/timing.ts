import type {
  BeatRole,
  CaptionCue,
  MascotPose,
  MockScene,
  TimedWord,
} from "./domain.js";

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
export function splitCaptionCues(
  cues: CaptionCue[],
  actualWords: TimedWord[],
): CaptionCue[] {
  if (!actualWords.length) throw new Error("Actual word timings are required");
  let previousEnd = 0;
  for (const word of actualWords) {
    if (word.start < previousEnd - 0.02 || word.end <= word.start)
      throw new Error("Actual word timings are invalid or overlapping");
    previousEnd = word.end;
  }
  const roles: BeatRole[] = [
    "hook",
    "concept-a",
    "concept-a-example",
    "concept-b",
    "scenario",
    "memory-rule",
  ];
  let actualOffset = 0;
  let substitutions = 0;
  let intendedTotal = 0;
  const phrases = cues.flatMap((cue, group) => {
    const intendedWords = cue.text.trim().split(/\s+/);
    const timedWords = actualWords.slice(
      actualOffset,
      actualOffset + intendedWords.length,
    );
    actualOffset += intendedWords.length;
    intendedTotal += intendedWords.length;
    const first = timedWords[0];
    const last = timedWords.at(-1);
    if (
      timedWords.length !== intendedWords.length ||
      !first ||
      !last ||
      first.start < cue.start - 0.25 ||
      last.end > cue.end + 0.25
    )
      throw new Error("Timed words do not match the approved caption cue");
    const token = (text: string) =>
      text.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (let index = 0; index < intendedWords.length; index++)
      if (token(intendedWords[index] ?? "") !== token(timedWords[index]?.text ?? ""))
        substitutions++;
    const sizes = chunkSizes(intendedWords.length);
    let wordOffset = 0;
    return sizes.map((size) => {
      const from = wordOffset;
      const to = wordOffset + size;
      wordOffset = to;
      const phraseFirst = timedWords[from];
      const phraseLast = timedWords[to - 1];
      if (!phraseFirst || !phraseLast)
        throw new Error("Caption phrase has no actual word timing");
      return {
        start: phraseFirst.start,
        end: phraseLast.end,
        text: intendedWords.slice(from, to).join(" "),
        role: roles[group] ?? "memory-rule",
      };
    });
  });
  if (actualOffset !== actualWords.length)
    throw new Error("Actual timing contains extra spoken words");
  if (substitutions / Math.max(1, intendedTotal) > 0.12)
    throw new Error("Spoken words differ too much from the approved script");
  return phrases;
}

const directions: Record<
  BeatRole,
  { pose: MascotPose; attention: MockScene["attention"] }
> = {
  hook: { pose: "confused", attention: "both" },
  "concept-a": { pose: "point-left", attention: "left" },
  "concept-a-example": { pose: "phone", attention: "left" },
  "concept-b": { pose: "laptop", attention: "right" },
  scenario: { pose: "compare-both", attention: "both" },
  "memory-rule": { pose: "conclusion", attention: "both" },
};

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
    const fallbackRoles = Object.keys(directions) as BeatRole[];
    const role = cue.role ?? fallbackRoles[index] ?? "memory-rule";
    const direction = directions[role];
    return {
      start,
      end: Math.min(end, duration),
      text: cue.text,
      pose: direction.pose,
      attention: direction.attention,
      role,
    };
  });
}
