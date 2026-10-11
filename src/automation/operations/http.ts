import { z } from "zod";
export type Request = {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  timeout?: number;
};
export class Http {
  constructor(private readonly signal: () => AbortSignal) {}
  async response(url: string, request: Request = {}): Promise<Response> {
    const timeout = AbortSignal.timeout(request.timeout ?? 60000);
    const response = await fetch(url, {
      ...request,
      signal: AbortSignal.any([this.signal(), timeout]),
    });
    if (!response.ok)
      throw new Error(
        `Provider request failed with HTTP ${response.status} (${new URL(url).hostname})`,
      );
    return response;
  }
  async json<T>(
    url: string,
    schema: z.ZodType<T>,
    request: Request = {},
  ): Promise<T> {
    const response = await this.response(url, request);
    const value: unknown = await response.json();
    return schema.parse(value);
  }
  async poll<T>(
    operation: () => Promise<T | undefined>,
    interval = 5000,
    limit = 120,
  ): Promise<T> {
    for (let attempt = 0; attempt < limit; attempt++) {
      this.signal().throwIfAborted();
      const result = await operation();
      if (result !== undefined) return result;
      await new Promise<void>((resolve, reject) => {
        const signal = this.signal();
        const done = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", cancel);
        };
        const cancel = () => {
          done();
          reject(new Error("Operation cancelled"));
        };
        const timer = setTimeout(() => {
          done();
          resolve();
        }, interval);
        signal.addEventListener("abort", cancel, { once: true });
        if (signal.aborted) cancel();
      });
    }
    throw new Error("Provider verification timed out");
  }
}
export async function twice<T>(
  operation: (attempt: number, previousError: string) => Promise<T>,
): Promise<T> {
  let previous = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await operation(attempt, previous);
    } catch (error) {
      previous = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(previous);
}
