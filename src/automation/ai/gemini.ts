import { z } from "zod";
import type { ResearchGenerator } from "./index.js";
import type { ResearchPacket } from "../domain.js";
import { Http } from "../operations/http.js";

const responseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(z.object({ text: z.string().optional() })),
        }),
      }),
    )
    .min(1),
});
const groundedResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(z.object({ text: z.string().optional() })),
        }),
        groundingMetadata: z
          .object({
            groundingChunks: z
              .array(
                z.object({
                  web: z
                    .object({ uri: z.url(), title: z.string().optional() })
                    .optional(),
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    )
    .min(1),
});

export function parseGroundedJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)?.[1];
  const candidate = (fenced ?? trimmed).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const objectStart = candidate.indexOf("{");
    const objectEnd = candidate.lastIndexOf("}");
    const arrayStart = candidate.indexOf("[");
    const arrayEnd = candidate.lastIndexOf("]");
    const start =
      objectStart < 0
        ? arrayStart
        : arrayStart < 0
          ? objectStart
          : Math.min(objectStart, arrayStart);
    const end = Math.max(objectEnd, arrayEnd);
    if (start < 0 || end <= start)
      throw new Error("Grounded Gemini response contains no JSON value");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

export class GeminiResearch implements ResearchGenerator {
  constructor(
    private readonly http: Http,
    private readonly model: string,
    private readonly key: string,
  ) {}
  async generate<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
    const response = await this.http.json(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      responseSchema,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": this.key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
        timeout: 180000,
      },
    );
    const text =
      response.candidates[0]?.content.parts
        .map((part) => part.text ?? "")
        .join("") ?? "";
    return schema.parse(JSON.parse(text));
  }
  async grounded<T>(
    prompt: string,
    schema: z.ZodType<T>,
  ): Promise<{ value: T; sources: ResearchPacket["sources"] }> {
    const response = await this.http.json(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      groundedResponseSchema,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": this.key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `${prompt}\nReturn only the requested valid JSON object. Do not use Markdown fences or explanatory text.`,
                },
              ],
            },
          ],
          tools: [{ google_search: {} }],
        }),
        timeout: 180000,
      },
    );
    const candidate = response.candidates[0];
    const text =
      candidate?.content.parts.map((part) => part.text ?? "").join("") ?? "";
    const input = parseGroundedJson(text);
    const seen = new Set<string>();
    const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
      .flatMap((chunk) => (chunk.web ? [chunk.web] : []))
      .filter((source) => {
        if (seen.has(source.uri)) return false;
        seen.add(source.uri);
        return true;
      })
      .map((source) => ({
        url: source.uri,
        title: source.title?.trim() || new URL(source.uri).hostname,
      }));
    return { value: schema.parse(input), sources };
  }
}
