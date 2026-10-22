import { z } from "zod";
import type { ResearchPacket, Task } from "../domain.js";
import type { Config } from "../operations/config.js";
import { twice } from "../operations/http.js";
import type { Gemini } from "../content/index.js";

const researchSchema = z.object({
  summary: z.string().min(40).max(5000),
});

function uniqueSources(
  sources: ResearchPacket["sources"],
): ResearchPacket["sources"] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const url = new URL(source.url).href;
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

export function createResearch(config: Config, gemini: Gemini) {
  return (task: Task): Promise<ResearchPacket> =>
    twice(async (attempt) => {
      try {
        const grounded = await gemini.grounded(
          config.GEMINI_SCRIPT_MODEL,
          config.GEMINI_API_KEY,
          `Research the engineering topic ${JSON.stringify(task.idea)} for a short explanation. Context: ${JSON.stringify(task.description)}. User-provided source URLs: ${JSON.stringify(task.sourceUrls)}. Prefer official product documentation, specifications, standards, and primary technical sources. Separate stable fundamentals from version-sensitive claims. Return JSON {summary}. Keep the summary factual and useful for a script writer; do not write the reel script.`,
          researchSchema,
        );
        const provided = task.sourceUrls.map((url) => ({
          url,
          title: new URL(url).hostname,
        }));
        const sources = uniqueSources([...provided, ...grounded.sources]);
        return {
          mode: sources.length ? "primary-evidence" : "gemini-best-effort",
          summary: grounded.value.summary,
          sources,
        };
      } catch (error) {
        if (attempt === 0) throw error;
        const fallback = await gemini.generate(
          config.GEMINI_SCRIPT_MODEL,
          config.GEMINI_API_KEY,
          `Give the best technically accurate background for ${JSON.stringify(task.idea)} using stable engineering knowledge. Context: ${JSON.stringify(task.description)}. Return JSON {summary}. Clearly avoid invented versions, measurements, quotations, or source claims.`,
          researchSchema,
        );
        return {
          mode: "gemini-best-effort",
          summary: fallback.summary,
          sources: task.sourceUrls.map((url) => ({
            url,
            title: new URL(url).hostname,
          })),
        };
      }
    });
}
