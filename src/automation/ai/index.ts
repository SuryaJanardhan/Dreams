import type { z } from "zod";
import type { ResearchPacket } from "../domain.js";

export interface StructuredGenerator {
  generate<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: { maxCompletionTokens?: number },
  ): Promise<T>;
  vision<T>(
    prompt: string,
    imagePath: string,
    mimeType: "image/jpeg" | "image/png",
    schema: z.ZodType<T>,
  ): Promise<T>;
}

export interface ResearchGenerator {
  generate<T>(prompt: string, schema: z.ZodType<T>): Promise<T>;
  grounded<T>(
    prompt: string,
    schema: z.ZodType<T>,
  ): Promise<{ value: T; sources: ResearchPacket["sources"] }>;
}
