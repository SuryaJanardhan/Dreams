import { readFile, access } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { z } from "zod";
async function main() {
  const root = process.cwd();
  const configured = new Set<string>();
  for (const path of [
    "tsconfig.json",
    "tsconfig.legacy.json",
    "reel-composer/tsconfig.json",
  ]) {
    const configPath = resolve(root, path);
    const source = ts.readConfigFile(configPath, ts.sys.readFile);
    if (source.error) throw new Error(`Cannot read ${path}`);
    const parsed = ts.parseJsonConfigFileContent(
      source.config,
      ts.sys,
      resolve(configPath, ".."),
    );
    if (parsed.errors.length)
      throw new Error(`Invalid compiler configuration: ${path}`);
    if (
      !parsed.options.strict ||
      !parsed.options.noUncheckedIndexedAccess ||
      !parsed.options.exactOptionalPropertyTypes ||
      !parsed.options.useUnknownInCatchVariables ||
      parsed.options.allowJs
    )
      throw new Error(`Strict source coverage weakened: ${path}`);
    for (const file of parsed.fileNames) configured.add(resolve(file));
  }
  const raw: unknown = JSON.parse(
    await readFile("docs/typescript-migration-files.json", "utf8"),
  );
  const manifest = z
    .array(z.object({ source: z.string(), target: z.string() }))
    .parse(raw);
  const targets = new Set<string>();
  for (const item of manifest) {
    if (targets.has(item.target)) throw new Error("Duplicate migration target");
    targets.add(item.target);
    await access(item.target);
    if (!configured.has(resolve(item.target)))
      throw new Error("Unchecked migrated file: " + item.target);
  }
  const tracked = execFileSync(
    "git",
    [
      "ls-files",
      "--",
      "src",
      "bin",
      "test",
      "archive",
      "scripts",
      "reel-composer",
      "tests",
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n");
  const authoredJS = tracked.filter((file) =>
    /\.(?:js|jsx|cjs|mjs)$/.test(file),
  );
  if (authoredJS.length)
    throw new Error(
      "Tracked JavaScript authoring remains: " + authoredJS.join(", "),
    );
  const uncheckedTS = tracked.filter(
    (file) => /\.tsx?$/.test(file) && !configured.has(resolve(file)),
  );
  if (uncheckedTS.length)
    throw new Error(
      "Tracked TypeScript outside compiler coverage: " + uncheckedTS.join(", "),
    );
  for (const file of configured) {
    const content = await readFile(file, "utf8");
    if (/@ts-(?:ignore|nocheck)/.test(content))
      throw new Error("Blanket suppression: " + relative(root, file));
    const source = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    function inspect(node: ts.Node) {
      if (node.kind === ts.SyntaxKind.AnyKeyword)
        throw new Error("Explicit any: " + relative(root, file));
      ts.forEachChild(node, inspect);
    }
    inspect(source);
  }
  console.log(
    `${manifest.length} JavaScript sources migrated; ${configured.size} TypeScript inputs covered by strict configurations; zero tracked JavaScript or blanket type suppressions`,
  );
}
void main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
