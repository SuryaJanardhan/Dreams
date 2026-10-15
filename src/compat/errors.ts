/** Read only diagnostic fields without replacing the original thrown value. */
export interface FailureInfo {
  message: string;
  stack?: string;
  response?: { status?: number; data: unknown; headers?: unknown };
  request?: unknown;
}
export function failureInfo(value: unknown): FailureInfo {
  const source = typeof value === "object" && value !== null ? value : {};
  const message = "message" in source ? String(source.message) : "";
  const response =
    "response" in source &&
    typeof source.response === "object" &&
    source.response !== null
      ? source.response
      : undefined;
  return {
    message,
    ...("stack" in source && typeof source.stack === "string"
      ? { stack: source.stack }
      : {}),
    ...("request" in source ? { request: source.request } : {}),
    ...(response
      ? {
          response: {
            data: "data" in response ? response.data : undefined,
            ...("status" in response && typeof response.status === "number"
              ? { status: response.status }
              : {}),
            ...("headers" in response ? { headers: response.headers } : {}),
          },
        }
      : {}),
  };
}
export function providerMessage(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (typeof data !== "object" || data === null) return undefined;
  if ("error_description" in data && typeof data.error_description === "string")
    return data.error_description;
  if ("error" in data) {
    if (typeof data.error === "string") return data.error;
    if (
      typeof data.error === "object" &&
      data.error !== null &&
      "message" in data.error &&
      typeof data.error.message === "string"
    )
      return data.error.message;
  }
  return undefined;
}
