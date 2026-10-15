import { createRequire } from "node:module";
import { z } from "zod";
/** Checked loading for historical optional modules; native MODULE_NOT_FOUND is preserved. */
export function historicalModule(
  path: string,
  fromFile: string,
): Record<string, unknown> {
  const value: unknown = createRequire(fromFile)(path);
  return z.record(z.string(), z.unknown()).parse(value);
}
export function stringMethod(module: Record<string, unknown>, name: string) {
  return async (...args: unknown[]): Promise<string> => {
    const method = module[name];
    if (typeof method !== "function")
      throw new TypeError(`${name} is not a function`);
    const value: unknown = await method(...args);
    return z.string().parse(value);
  };
}
export function unknownMethod(module: Record<string, unknown>, name: string) {
  return async (...args: unknown[]): Promise<unknown> => {
    const method = module[name];
    if (typeof method !== "function")
      throw new TypeError(`${name} is not a function`);
    const value: unknown = await method(...args);
    return value;
  };
}

export function booleanMethod(module: Record<string, unknown>, name: string) {
  return (...args: unknown[]): boolean => {
    const method = module[name];
    if (typeof method !== "function")
      throw new TypeError(`${name} is not a function`);
    const result: unknown = method(...args);
    return z.boolean().parse(result);
  };
}
