import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { ResearchGenerator, StructuredGenerator } from "./index.js";
import type { ResearchPacket } from "../domain.js";
import { Http, HttpError } from "../operations/http.js";

export interface GroqConfig {
  keys: readonly string[];
  model: string;
  baseUrl?: string;
  wait?: (milliseconds: number) => Promise<void>;
}

export class GroqPoolExhaustedError extends Error {
  readonly retryable = false;
  constructor(readonly details: string[]) {
    super(
      `Groq key pool unavailable: ${details.join("; ") || "all keys disabled"}`,
    );
    this.name = "GroqPoolExhaustedError";
  }
}

const responseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().min(1) }) }))
    .min(1),
});

export class Groq implements StructuredGenerator, ResearchGenerator {
  private cursor = 0;
  private readonly unavailable = new Set<string>();
  private readonly baseUrl: string;
  private readonly wait: (milliseconds: number) => Promise<void>;
  constructor(
    private readonly config: GroqConfig,
    private readonly http: Http,
  ) {
    if (!config.keys.length) throw new Error("Groq key pool is empty");
    if (new Set(config.keys).size !== config.keys.length)
      throw new Error("Groq key pool contains duplicates");
    this.baseUrl = (config.baseUrl ?? "https://api.groq.com/openai/v1").replace(
      /\/$/,
      "",
    );
    this.wait =
      config.wait ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }
  private orderedKeys() {
    const start = this.cursor;
    this.cursor = (this.cursor + 1) % this.config.keys.length;
    return this.config.keys.map(
      (_, offset) =>
        this.config.keys[(start + offset) % this.config.keys.length]!,
    );
  }
  private async complete<T>(
    messages: unknown[],
    schema: z.ZodType<T>,
    maxCompletionTokens: number,
  ) {
    const errors: string[] = [];
    for (const key of this.orderedKeys()) {
      if (this.unavailable.has(key)) continue;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await this.http.json(
            `${this.baseUrl}/chat/completions`,
            responseSchema,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: this.config.model,
                messages,
                response_format: { type: "json_object" },
                reasoning_effort: "none",
                temperature: 0.2,
                max_completion_tokens: maxCompletionTokens,
                stream: false,
              }),
              timeout: 180000,
            },
          );
          const value: unknown = JSON.parse(
            response.choices[0]?.message.content ?? "",
          );
          return schema.parse(value);
        } catch (error) {
          if (error instanceof HttpError && error.status === 429) {
            errors.push(error.message);
            if (attempt === 0) {
              const seconds = /try again in\s+([\d.]+)s/i.exec(
                error.message,
              )?.[1];
              const delayMs = seconds
                ? Math.min(60000, Math.ceil(Number(seconds) * 1000) + 250)
                : 15000;
              await this.wait(delayMs);
              continue;
            }
            break;
          }
          if (
            error instanceof HttpError &&
            [401, 403, 500, 502, 503, 504].includes(error.status)
          ) {
            errors.push(error.message);
            if ([401, 403].includes(error.status)) this.unavailable.add(key);
            break;
          }
          throw error;
        }
      }
    }
    throw new GroqPoolExhaustedError(errors);
  }
  generate<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options: { maxCompletionTokens?: number } = {},
  ): Promise<T> {
    return this.complete(
      [
        {
          role: "system",
          content:
            "Return only one valid JSON object matching the requested structure. Do not include Markdown fences or commentary.",
        },
        { role: "user", content: prompt },
      ],
      schema,
      // Groq's free on-demand tier enforces a 1,000 output-token/minute
      // organization cap. Keep individual calls below that ceiling so a
      // valid response is possible even when several stages share the pool.
      options.maxCompletionTokens ?? 768,
    );
  }
  async grounded<T>(prompt: string, schema: z.ZodType<T>): Promise<{ value: T; sources: ResearchPacket["sources"] }> {
    return { value: await this.generate(prompt, schema), sources: [] };
  }
  async vision<T>(
    prompt: string,
    imagePath: string,
    mimeType: "image/jpeg" | "image/png",
    schema: z.ZodType<T>,
  ): Promise<T> {
    const image = (await readFile(imagePath)).toString("base64");
    return this.complete(
      [
        {
          role: "system",
          content:
            "Inspect the attached image and return only one valid JSON object matching the requested structure.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${image}` },
            },
          ],
        },
      ],
      schema,
      768,
    );
  }
}
