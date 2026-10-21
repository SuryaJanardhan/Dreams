import { z } from "zod";
import type { Task, ContentPlan } from "../domain.js";
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
}
const directionSchema = z.object({
  example: z.string().min(10).max(600),
  payoff: z.string().min(10).max(400),
  objects: z
    .array(
      z.object({
        id: z.string().regex(/^[a-zA-Z0-9-]+$/),
        label: z.string().min(1).max(50),
        role: z.string().min(1).max(180),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        box: z
          .object({
            x: z.number().int().min(0).max(820),
            y: z.number().int().min(0).max(1230),
            width: z.number().int().min(80).max(700),
            height: z.number().int().min(60).max(600),
          })
          .refine(
            (box) => box.x + box.width <= 900,
            "Object exceeds scene width",
          )
          .refine(
            (box) => box.y + box.height <= 1310,
            "Object exceeds scene height",
          ),
      }),
    )
    .min(2)
    .max(8),
  rules: z.string().min(10).max(600),
});
const planSchema = z.object({
  title: z.string().min(1).max(100),
  narration: z.string().min(1),
  caption: z.string().min(1).max(2000),
  direction: directionSchema,
  beats: z
    .array(
      z.object({
        id: z.string().regex(/^[a-zA-Z0-9-]+$/),
        text: z.string().min(1),
        visual: z.string().min(1),
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
  plan: Omit<ContentPlan, "grade">,
  task: Task,
): number {
  const words = plan.narration.split(/\s+/).filter(Boolean).length;
  if (words < 90 || words > 180)
    throw new Error(
      "Narration word count cannot reasonably fit the selected sixty-second target",
    );
  let score = 100;
  if (words < 115 || words > 165) score -= 20;
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
  if (
    plan.direction &&
    new Set(plan.direction.objects.map((object) => object.id)).size !==
      plan.direction.objects.length
  )
    throw new Error("Visual objects must have unique persistent IDs");
  if (score < 80)
    throw new Error(`Content quality grade ${score}/100 is below 80`);
  return score;
}
export function createContent(config: Config, gemini: Gemini) {
  return (task: Task) =>
    twice(async (_attempt, error) => {
      const plan = await gemini.generate(
        config.GEMINI_SCRIPT_MODEL,
        config.GEMINI_API_KEY,
        `Prepare an English technical educational reel about ${JSON.stringify(task.idea)}. Context: ${JSON.stringify(task.description)}.
${task.narration ? `Use exactly this supplied narration without rewriting it: ${JSON.stringify(task.narration)}` : "Write a single continuous spoken narration of 115–165 words. Let the explanation end naturally; do not pad or rush it to hit an exact duration."}
Keep simple English, explain like a friend, keep technical terms and spell acronyms out on first use. No introductions, outros, stage directions, markdown, headings, or unsupported factual meta-claims. Output JSON: {title,narration,caption,beats:[{id,text,visual}],direction:{example,payoff,objects:[{id,label,role,color,box:{x,y,width,height}}],rules}}.
The example is one concrete scenario carried from opening to payoff. Use 2–8 persistent diagram objects with unique IDs, consistent six-digit hex colors and fixed pixel boxes inside the 900×1310 scene. Boxes must not leave the scene. Describe a visible causal action in EVERY beat: request transfer, comparison, route, state change or result. Reuse these same IDs and boxes in each beat's visual brief. The opening immediately demonstrates the problem; the middle shows the mechanism; the final beat reveals a specific outcome. Rules define shared typography and restrained transitions. Never use a decorative particle montage or moving text as the whole explanation.
Use short varied sentences, purposeful punctuation and natural breath pauses. Prefer established expanded terms when an acronym would otherwise be unclear; preserve supplied text exactly. Use 3–8 explanation beats whose text partitions EXACTLY the narration in order. Visuals should be clear custom technical animations with dark background, cyan/magenta accents, accurate arrows, no humans. Caption is shared across all three platforms: concise explanation, hashtags, keywords. Produce coherent narration and visuals jointly. ${error ? `Previous validation failed; fix it: ${error}` : ""}`,
        planSchema,
      );
      const structuralGrade = gradeContent(plan, task);
      const quality = await gemini.generate(
        config.GEMINI_SCRIPT_MODEL,
        config.GEMINI_API_KEY,
        `Audit this short technical explanation without rewriting it. Topic: ${JSON.stringify(task.idea)}. Trusted context: ${JSON.stringify(task.description)}. Plan: ${JSON.stringify(plan)}.
Return JSON {clarity,accuracy,exampleUsefulness,authenticity,issues}. Score each dimension 0–100. Accuracy means definitions and causal claims agree with established technical meaning and the trusted context. Example usefulness means the example visibly demonstrates the mechanism rather than decorating it. Authenticity means direct, specific, conversational language without hype, generic filler, fake personal experience or engagement bait. Clarity includes a comprehensible opening, logical progression and memorable payoff. List concrete issues only. Be strict; formatting validity alone is not quality.`,
        explanationQualitySchema,
      );
      const explanationGrade = requireExplanationQuality(quality);
      return { ...plan, grade: Math.min(structuralGrade, explanationGrade) };
    });
}
