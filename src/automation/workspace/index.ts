import { mkdir, rm, realpath, readFile } from "node:fs/promises";
import { resolve, basename, dirname } from "node:path";
import type { Workspace } from "../domain.js";
export async function createWorkspace(
  root: string,
  id: string,
): Promise<Workspace> {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid workspace ID");
  const parent = resolve(root, ".automation-runs");
  await mkdir(parent, { recursive: true });
  if ((await realpath(parent)) !== parent)
    throw new Error("Workspace root must not be a symlink");
  const path = resolve(parent, id);
  await mkdir(path, { recursive: false });
  return {
    path,
    file(name) {
      if (name !== basename(name) || name === "." || name === "..")
        throw new Error("Workspace filenames cannot escape their job");
      return resolve(path, name);
    },
    async cleanup() {
      if (dirname(path) !== parent || (await realpath(path)) !== path)
        throw new Error("Unsafe workspace cleanup refused");
      await rm(path, { recursive: true });
      return ["Generated job media, frames, and animation code removed"];
    },
  };
}
export async function assertAsset(path: string): Promise<void> {
  const content = await readFile(path);
  if (
    content.length < 32 ||
    content.subarray(0, 64).toString().includes("git-lfs.github.com/spec")
  )
    throw new Error(`Missing real asset: ${basename(path)}`);
}
