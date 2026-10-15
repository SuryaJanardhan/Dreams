import { resolve } from "node:path";
import { realpathSync } from "node:fs";
/** The original .js launch path is a generated wrapper; .ts is its real implementation. */
export function isMain(current: NodeJS.Module, filename: string): boolean {
  if (require.main === current) return true;
  const argument = process.argv[1];
  if (!argument) return false;
  let entry = resolve(argument);
  try {
    entry = realpathSync(entry);
  } catch {}
  return entry === filename || entry === filename.replace(/\.ts$/, ".js");
}
