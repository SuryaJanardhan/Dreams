import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { CaptionTrack, ContentPlan, Narration, Word } from "../domain.js";
import type { Config } from "../operations/config.js";
import { Http, twice } from "../operations/http.js";
import { normalize } from "../content/index.js";
const transcriptSchema = z.object({
  id: z.string(),
  status: z.string(),
  error: z.string().optional(),
  words: z
    .array(
      z.object({
        text: z.string(),
        start: z.number().nonnegative(),
        end: z.number().positive(),
      }),
    )
    .nullable()
    .optional(),
});
/** Align intended words with actual timings; substitutions retain actual timing, missing words are rejected. */
export function alignCaptions(
  plan: ContentPlan,
  narration: Narration,
  actual: Word[],
): CaptionTrack {
  if (!actual.length) throw new Error("Transcription has no timed words");
  let previous = 0;
  for (const word of actual) {
    if (
      word.start < previous - 0.02 ||
      word.end <= word.start ||
      word.end > narration.duration + 0.2
    )
      throw new Error("Invalid or overlapping caption timings");
    previous = word.end;
  }
  const expected = plan.narration.trim().split(/\s+/);
  const n = expected.length,
    m = actual.length;
  if (n > 500 || m > 1000)
    throw new Error("Caption word count exceeds short-video limits");
  const costs = Array.from({ length: n + 1 }, () =>
    Array<number>(m + 1).fill(0),
  );
  const get = (row: number, column: number): number => {
    const value = costs[row]?.[column];
    if (value === undefined) throw new Error("Caption alignment index invalid");
    return value;
  };
  const set = (row: number, column: number, value: number) => {
    const values = costs[row];
    if (!values || column < 0 || column > m)
      throw new Error("Caption alignment index invalid");
    values[column] = value;
  };
  for (let i = 0; i <= n; i++) set(i, 0, i);
  for (let j = 0; j <= m; j++) set(0, j, j);
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      set(
        i,
        j,
        Math.min(
          get(i - 1, j) + 1,
          get(i, j - 1) + 1,
          get(i - 1, j - 1) +
            (normalize(expected[i - 1] ?? "") ===
            normalize(actual[j - 1]?.text ?? "")
              ? 0
              : 1),
        ),
      );
  if (get(n, m) / Math.max(n, m) > 0.12)
    throw new Error(
      "Spoken narration differs too much from script for safe caption correction",
    );
  const aligned: Word[] = [];
  let i = n,
    j = m;
  while (i > 0 || j > 0) {
    const cost = get(i, j);
    if (
      i > 0 &&
      j > 0 &&
      cost ===
        get(i - 1, j - 1) +
          (normalize(expected[i - 1] ?? "") ===
          normalize(actual[j - 1]?.text ?? "")
            ? 0
            : 1)
    ) {
      const word = actual[j - 1];
      const text = expected[i - 1];
      if (!word || !text) throw new Error("Caption alignment index invalid");
      aligned.unshift({ ...word, text });
      i--;
      j--;
    } else if (j > 0 && cost === get(i, j - 1) + 1) {
      j--;
    } else {
      throw new Error(
        "Narration omitted script words; cannot invent caption timing",
      );
    }
  }
  let offset = 0;
  const beats = plan.beats.map((beat) => {
    const count = beat.text.trim().split(/\s+/).length;
    const first = aligned[offset];
    const last = aligned[offset + count - 1];
    offset += count;
    if (!first || !last)
      throw new Error("Beat cannot be mapped to actual words");
    return { ...beat, start: first.start, end: last.end };
  });
  if (offset !== aligned.length)
    throw new Error("Scene beats do not cover the complete narration");
  return { words: aligned, beats, duration: narration.duration };
}
export function createCaptions(config: Config, http: Http) {
  return (plan: ContentPlan, narration: Narration) =>
    twice(async () => {
      const headers = { authorization: config.ASSEMBLYAI_API_KEY };
      const bytes = await readFile(narration.path);
      const upload = await http.json(
        "https://api.assemblyai.com/v2/upload",
        z.object({ upload_url: z.url() }),
        {
          method: "POST",
          headers,
          body: new Blob([new Uint8Array(bytes)]),
          timeout: 120000,
        },
      );
      const created = await http.json(
        "https://api.assemblyai.com/v2/transcript",
        transcriptSchema,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            audio_url: upload.upload_url,
            language_code: "en",
            speech_models: ["universal-2"],
            word_boost: plan.beats.flatMap(
              (beat) => beat.text.match(/\b[A-Z]{2,}\b/g) ?? [],
            ),
          }),
        },
      );
      const transcript = await http.poll(
        async () => {
          const result = await http.json(
            `https://api.assemblyai.com/v2/transcript/${created.id}`,
            transcriptSchema,
            { headers },
          );
          if (result.status === "error")
            throw new Error(result.error ?? "AssemblyAI transcription failed");
          return result.status === "completed" ? result : undefined;
        },
        5000,
        120,
      );
      return alignCaptions(
        plan,
        narration,
        (transcript.words ?? []).map((word) => ({
          text: word.text,
          start: word.start / 1000,
          end: word.end / 1000,
        })),
      );
    });
}
