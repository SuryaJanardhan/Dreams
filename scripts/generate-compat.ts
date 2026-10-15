import { readFile, writeFile, access } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { z } from "zod";
const header = "// Generated TypeScript compatibility launcher. Do not edit.\n";
const item = z.object({
  source: z.string().regex(/^(src|bin|test|archive)\/[a-zA-Z0-9_/-]+\.js$/),
  target: z.string().regex(/^(src|bin|test|archive)\/[a-zA-Z0-9_/-]+\.ts$/),
});
export async function generateCompatibility(root = process.cwd()) {
  const value: unknown = JSON.parse(
    await readFile(
      resolve(root, "docs/typescript-migration-files.json"),
      "utf8",
    ),
  );
  const entries = z.array(item).parse(value);
  for (const entry of entries) {
    if (entry.source.replace(/\.js$/, ".ts") !== entry.target)
      throw new Error("Compatibility source/target mismatch");
    await access(resolve(root, entry.target));
    const destination = resolve(root, entry.source);
    let existing: string | undefined;
    try {
      existing = await readFile(destination, "utf8");
    } catch (error) {
      if (!(
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    if (existing !== undefined && !existing.startsWith(header))
      throw new Error(`Refusing to overwrite authored code: ${entry.source}`);
    let target = relative(
      dirname(destination),
      resolve(root, entry.target),
    ).replaceAll("\\", "/");
    if (!target.startsWith(".")) target = "./" + target;
    await writeFile(
      destination,
      header +
        `const loaderKey = Symbol.for('dreams.typescript.compatibility');\nif (!globalThis[loaderKey]) globalThis[loaderKey] = require('tsx/cjs/api').register();\nmodule.exports = require(${JSON.stringify(target)});\n`,
    );
  }
  return entries.length;
}
if (require.main === module)
  void generateCompatibility()
    .then((count) => console.log(`Generated ${count} compatibility launchers`))
    .catch((error) => {
      console.error(String(error));
      process.exitCode = 1;
    });
