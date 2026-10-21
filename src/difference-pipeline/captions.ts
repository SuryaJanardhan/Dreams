import { readFile } from "node:fs/promises";
import { z } from "zod";
import { Http, twice } from "../automation/operations/http.js";
import type { TimedWord } from "./domain.js";

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

/** Production timing adapter: captions are always derived from the final spoken audio. */
export function createWordTiming(apiKey: string, http: Http) {
  if (!apiKey.trim()) throw new Error("ASSEMBLYAI_API_KEY is required");
  return (audioPath: string): Promise<TimedWord[]> =>
    twice(async () => {
      const headers = { authorization: apiKey };
      const bytes = await readFile(audioPath);
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
      const words = (transcript.words ?? []).map((word) => ({
        text: word.text,
        start: word.start / 1000,
        end: word.end / 1000,
      }));
      if (!words.length) throw new Error("AssemblyAI returned no word timings");
      return words;
    });
}
