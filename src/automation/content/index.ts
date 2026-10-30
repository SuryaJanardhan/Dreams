import { z } from "zod";
import { readFile } from "node:fs/promises";
import { contentTypes, platforms } from "../domain.js";
import type { Task, ContentPlan, ResearchPacket } from "../domain.js";
import type { Config } from "../operations/config.js";
import { Http, twice } from "../operations/http.js";
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
export class Gemini {
  constructor(private readonly http: Http) {}
  async generate<T>(
    model: string,
    key: string,
    prompt: string,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const response = await this.http.json(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      responseSchema,
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
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
    const value: unknown = JSON.parse(text);
    return schema.parse(value);
  }
  async grounded<T>(
    model: string,
    key: string,
    prompt: string,
    schema: z.ZodType<T>,
  ): Promise<{ value: T; sources: ResearchPacket["sources"] }> {
    const response = await this.http.json(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      groundedResponseSchema,
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
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
  async vision<T>(
    model: string,
    key: string,
    prompt: string,
    imagePath: string,
    mimeType: "image/jpeg" | "image/png",
    schema: z.ZodType<T>,
  ): Promise<T> {
    const response = await this.http.json(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      responseSchema,
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: (await readFile(imagePath)).toString("base64"),
                  },
                },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
        timeout: 180000,
      },
    );
    const text =
      response.candidates[0]?.content.parts
        .map((part) => part.text ?? "")
        .join("") ?? "";
    const input: unknown = JSON.parse(text);
    return schema.parse(input);
  }
}
export function safeIdentifier(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
const identifierSchema = z
  .string()
  .transform(safeIdentifier)
  .pipe(
    z
      .string()
      .min(1)
      .regex(/^[a-zA-Z0-9-]+$/),
  );
const planSchema = z.object({
  type: z.enum(contentTypes),
  title: z.string().min(1).max(100),
  narration: z.string().min(1),
  copies: z.object(
    Object.fromEntries(
      platforms.map((platform) => [
        platform,
        z.object({
          title: z.string().min(1).max(100),
          description: z.string().min(1).max(2000),
        }),
      ]),
    ) as Record<
      (typeof platforms)[number],
      z.ZodObject<{
        title: z.ZodString;
        description: z.ZodString;
      }>
    >,
  ),
  beats: z
    .array(
      z.object({
        id: identifierSchema,
        text: z.string().min(1),
        purpose: z.string().min(5).max(240),
      }),
    )
    .min(3)
    .max(8),
});
const explanationQualitySchema = z.object({
  clarity: z.number().int().min(0).max(100),
  accuracy: z.number().int().min(0).max(100),
  exampleUsefulness: z.number().int().min(0).max(100),
  authenticity: z.number().int().min(0).max(100),
  issues: z.array(z.string().min(1).max(240)).max(5),
});
type ExplanationQuality = z.infer<typeof explanationQualitySchema>;

export function requireExplanationQuality(quality: ExplanationQuality): number {
  const checks: [string, number][] = [
    ["clarity", quality.clarity],
    ["accuracy", quality.accuracy],
    ["example usefulness", quality.exampleUsefulness],
    ["authenticity", quality.authenticity],
  ];
  const failed = checks.filter(([, score]) => score < 80);
  if (failed.length)
    throw new Error(
      `Content quality failed: ${failed.map(([name, score]) => `${name} ${score}/100`).join(", ")}${quality.issues.length ? ` — ${quality.issues.join("; ")}` : ""}`,
    );
  return Math.round(
    checks.reduce((total, [, score]) => total + score, 0) / checks.length,
  );
}
export function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
export function gradeContent(
  plan: Omit<ContentPlan, "grade" | "research">,
  task: Task,
): number {
  const words = plan.narration.split(/\s+/).filter(Boolean).length;
  if (words < 80 || words > 180)
    throw new Error(
      `Narration word count ${words} cannot reasonably fit the selected sixty-second target`,
    );
  let score = 100;
  if (words < 105 || words > 155) score -= 20;
  if (
    /^(hey guys|welcome|today we will)/i.test(plan.narration.trim()) ||
    /follow for more|let me know/i.test(plan.narration)
  )
    throw new Error("Generic introduction or engagement bait is prohibited");
  if (/\*|\[[^\]]+\]|\b(hook|gap|value|loop):/i.test(plan.narration))
    throw new Error("Stage directions or prompt labels are prohibited");
  if (new Set(plan.beats.map((beat) => beat.id)).size !== plan.beats.length)
    throw new Error("Duplicate explanation beat IDs");
  if (
    normalize(plan.beats.map((beat) => beat.text).join(" ")) !==
    normalize(plan.narration)
  )
    throw new Error(
      "Explanation beats must partition the exact narration in order",
    );
  if (task.narration && plan.narration.trim() !== task.narration.trim())
    throw new Error("Supplied narration must not be rewritten");
  if (task.type && plan.type !== task.type)
    throw new Error(
      `Content type must preserve the Sheet override ${task.type}`,
    );
  if (score < 80)
    throw new Error(`Content quality grade ${score}/100 is below 80`);
  return score;
}
export function createContent(config: Config, gemini: Gemini) {
  return (task: Task, research: ResearchPacket) =>
    twice(async (_attempt, error) => {
      const plan = await gemini.generate(
        config.GEMINI_SCRIPT_MODEL,
        config.GEMINI_API_KEY,
        `Prepare an English technical educational reel about ${JSON.stringify(task.idea)}. Context: ${JSON.stringify(task.description)}. Audience: ${JSON.stringify(task.audience || "people learning practical software engineering")}. Research: ${JSON.stringify(research)}.
${task.narration ? `Use exactly this supplied narration without rewriting it: ${JSON.stringify(task.narration)}` : "Write a single continuous spoken narration of 105–155 words. Let the explanation end naturally; do not pad or rush it to hit an exact duration."}
${task.type ? `The Sheet explicitly sets type=${task.type}; preserve it.` : `Classify type as one of ${contentTypes.join(", ")}.`} Follow the matching structure: question = problem, naive understanding, failure, correct model; comparison = shared purpose, essential difference, concrete example, practical choice; interview = exact prompt, reasoning, scalable answer, tradeoff; scenario = initial state, triggering event, consequence, resolution.
Keep simple natural Indian English and explain like a knowledgeable friend. Spell acronyms out on first use. Open with the exact confusion or problem. Carry one concrete example through the explanation. No greeting, dramatic social hook, outro, engagement bait, stage direction, markdown, heading, fake personal experience, or unsupported factual claim.
Output JSON {type,title,narration,beats:[{id,text,purpose}],copies:{youtube:{title,description},instagram:{title,description},facebook:{title,description}}}. Beat IDs must use only letters, numbers and hyphens, for example beat-1. Use 3–8 beats whose text partitions EXACTLY the narration in order. Each purpose states the causal idea that must become visible. Write distinct platform descriptions but preserve the same factual meaning. ${error ? `Previous validation failed; fix it: ${error}` : ""}`,
        planSchema,
      );
      const structuralGrade = gradeContent(plan, task);
      const quality = await gemini.generate(
        config.GEMINI_SCRIPT_MODEL,
        config.GEMINI_API_KEY,
        `Audit this short technical explanation without rewriting it. Topic: ${JSON.stringify(task.idea)}. Trusted context and evidence: ${JSON.stringify(research)}. Plan: ${JSON.stringify(plan)}.
Return JSON {clarity,accuracy,exampleUsefulness,authenticity,issues}. Score each dimension 0–100. Accuracy means definitions and causal claims agree with established technical meaning and the trusted context. Example usefulness means the example visibly demonstrates the mechanism rather than decorating it. Authenticity means direct, specific, conversational language without hype, generic filler, fake personal experience or engagement bait. Clarity includes a comprehensible opening, logical progression and memorable payoff. List concrete issues only. Be strict; formatting validity alone is not quality.`,
        explanationQualitySchema,
      );
      const explanationGrade = requireExplanationQuality(quality);
      return {
        ...plan,
        research,
        grade: Math.min(structuralGrade, explanationGrade),
      };
    });
}
