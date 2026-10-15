/** Checked index/configuration access shared by legacy adapters. */
export function present<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined)
    throw new Error(`${label} is required`);
  return value;
}
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
export function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function truthy<T>(
  value: T,
): value is Exclude<T, null | undefined | false | 0 | ""> {
  return Boolean(value);
}
