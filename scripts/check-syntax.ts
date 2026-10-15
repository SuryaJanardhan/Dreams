import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
async function files(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) found.push(...(await files(path)));
    else if (/\.(c?js|mjs)$/.test(item.name)) found.push(path);
  }
  return found;
}
async function main() {
  const outputs = [
    ...(await files("dist")),
    ...(await files("dist-legacy")),
    ...(await files("reel-composer/dist")),
  ];
  for (const file of outputs)
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  console.log(
    `Syntax checked ${outputs.length} emitted JavaScript files without executing them`,
  );
}
void main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
