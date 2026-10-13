import ts from "typescript";
import { transformSync } from "esbuild";
import { writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Workspace } from "../domain.js";
const forbidden = new Set([
  "fetch",
  "window",
  "self",
  "globalThis",
  "Promise",
  "queueMicrotask",
  "MutationObserver",
  "ResizeObserver",
  "crypto",
  "navigator",
  "Audio",
  "AudioContext",
  "WebAssembly",
  "onStart",
  "onUpdate",
  "onComplete",
  "onRepeat",
  "onReverseComplete",
  "XMLHttpRequest",
  "WebSocket",
  "Worker",
  "SharedWorker",
  "eval",
  "Function",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
  "Date",
  "performance",
  "process",
  "require",
  "localStorage",
  "sessionStorage",
  "indexedDB",
]);
export async function validateScene(
  source: string,
  name: string,
  workspace: Workspace,
  root: string,
): Promise<string> {
  if (source.length > 100000)
    throw new Error("Generated scene exceeds code-size limit");
  const parsed = ts.createSourceFile(
    name,
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  function inspect(node: ts.Node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword)
      throw new Error("Scene code must not use any");
    if (ts.isIdentifier(node) && forbidden.has(node.text))
      throw new Error(
        `Unsupported nondeterministic/external capability: ${node.text}`,
      );
    if (
      ts.isPropertyAccessExpression(node) &&
      [
        "play",
        "reverse",
        "pause",
        "paused",
        "seek",
        "time",
        "totalTime",
        "progress",
        "totalProgress",
        "timeScale",
        "add",
        "tweenTo",
        "tweenFromTo",
        "resume",
        "restart",
        "addPause",
        "call",
        "eventCallback",
        "random",
        "animation",
        "animationName",
        "innerHTML",
        "outerHTML",
      ].includes(node.name.text)
    )
      throw new Error(`Unsupported animation capability: ${node.name.text}`);
    if (ts.isElementAccessExpression(node))
      throw new Error(
        "Computed property access is unsupported in generated scenes",
      );
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    )
      throw new Error("Dynamic imports are prohibited");
    if (
      ts.isImportDeclaration(node) &&
      (!node.importClause?.isTypeOnly ||
        !ts.isStringLiteral(node.moduleSpecifier) ||
        node.moduleSpecifier.text !== "./scene-contract")
    )
      throw new Error("Only type imports from ./scene-contract are allowed");
    if (ts.isExportDeclaration(node))
      throw new Error("Re-exporting dependencies is prohibited");
    if (ts.isAsExpression(node) || ts.isNonNullExpression(node))
      throw new Error("Generated scene cannot bypass types with assertions");
    ts.forEachChild(node, inspect);
  }
  inspect(parsed);
  const file = workspace.file(name);
  await writeFile(file, source);
  await copyFile(
    resolve(root, "src/automation/rendering/scene-contract.ts"),
    workspace.file("scene-contract.ts"),
  );
  const check = workspace.file("scene-check.ts");
  await writeFile(
    check,
    `import { createScene } from './${name.replace(/\.ts$/, "")}'; import type { CreateScene } from './scene-contract'; const checked: CreateScene = createScene; export default checked;`,
  );
  const program = ts.createProgram([file, check], {
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length)
    throw new Error(
      ts
        .formatDiagnostics(diagnostics, {
          getCurrentDirectory: () => root,
          getCanonicalFileName: (path) => path,
          getNewLine: () => "\n",
        })
        .slice(0, 6000),
    );
  return transformSync(source, {
    loader: "ts",
    format: "iife",
    globalName: "GeneratedScene",
    target: "es2022",
  }).code;
}
