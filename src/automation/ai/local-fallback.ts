import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { z } from "zod";
import type { ResearchPacket } from "../domain.js";
import type { ResearchGenerator, StructuredGenerator } from "./index.js";

/**
 * Local-only bridge for an external reasoning agent. It never runs in CI.
 * A failed provider call writes a prompt request and waits for a JSON response
 * produced by the supervising agent, then validates that response normally.
 */
export class LocalFallbackGenerator implements StructuredGenerator, ResearchGenerator {
  constructor(
    private readonly primary: StructuredGenerator & ResearchGenerator,
    private readonly root: string,
    private readonly signal: () => AbortSignal,
  ) {}

  private async fallback<T>(kind: string, payload: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    const dir = process.env.LOCAL_OUTPUT_DIR || resolve(this.root, "output");
    await mkdir(dir, { recursive: true });
    const requestPath = resolve(dir, "ai-fallback-request.json");
    const responsePath = resolve(dir, "ai-fallback-response.json");
    await writeFile(requestPath, JSON.stringify({ kind, ...payload }, null, 2), "utf8");
    for (;;) {
      this.signal().throwIfAborted();
      try {
        const raw = await readFile(responsePath, "utf8");
        const value = schema.parse(JSON.parse(raw));
        await writeFile(resolve(dir, "ai-fallback-consumed.json"), raw, "utf8");
        return value;
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          await new Promise((resolveWait) => setTimeout(resolveWait, 5000));
          continue;
        }
        if (error instanceof SyntaxError || error instanceof Error) {
          await new Promise((resolveWait) => setTimeout(resolveWait, 5000));
          continue;
        }
        throw error;
      }
    }
  }

  async generate<T>(prompt: string, schema: z.ZodType<T>, options?: { maxCompletionTokens?: number }): Promise<T> {
    try { return await this.primary.generate(prompt, schema, options); }
    catch (error) { return this.fallback("generate", { prompt, error: String(error) }, schema); }
  }

  async vision<T>(prompt: string, imagePath: string, mimeType: "image/jpeg" | "image/png", schema: z.ZodType<T>): Promise<T> {
    try { return await this.primary.vision(prompt, imagePath, mimeType, schema); }
    catch (error) { return this.fallback("vision", { prompt, imagePath, mimeType, error: String(error) }, schema); }
  }

  async grounded<T>(prompt: string, schema: z.ZodType<T>): Promise<{ value: T; sources: ResearchPacket["sources"] }> {
    try { return await this.primary.grounded(prompt, schema); }
    catch (error) { return { value: await this.fallback("grounded", { prompt, error: String(error) }, schema), sources: [] }; }
  }
}
