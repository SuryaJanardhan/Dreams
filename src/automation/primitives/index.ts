import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PrimitiveSpec } from "../domain.js";

const colors = {
  structure: "#151515",
  active: "#2878d0",
  success: "#3f8f62",
  warning: "#e7c536",
  failure: "#cf4e46",
} as const;
function escape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function svg(spec: PrimitiveSpec) {
  const shapes = spec.shapes
    .map((shape) => {
      const color = colors[shape.semantic];
      switch (shape.kind) {
        case "rect":
          return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width ?? 10}" height="${shape.height ?? 10}" rx="4" fill="none" stroke="${color}" stroke-width="3"/>`;
        case "circle":
          return `<circle cx="${shape.x}" cy="${shape.y}" r="${(shape.width ?? 10) / 2}" fill="none" stroke="${color}" stroke-width="3"/>`;
        case "line":
          return `<line x1="${shape.x}" y1="${shape.y}" x2="${shape.x + (shape.width ?? 10)}" y2="${shape.y + (shape.height ?? 0)}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
        case "path":
          return `<path d="${escape(shape.text ?? "")}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
        case "text":
          return `<text x="${shape.x}" y="${shape.y}" fill="${color}" font-size="9" font-weight="700">${escape(shape.text ?? "")}</text>`;
      }
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="800" height="800"><rect width="100" height="100" fill="white"/>${shapes}</svg>`;
}

export async function writePrimitiveReviewArtifacts(
  root: string,
  jobId: string,
  specs: PrimitiveSpec[],
) {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId))
    throw new Error("Invalid primitive review job ID");
  const directory = resolve(root, ".primitive-reviews", jobId);
  await mkdir(directory, { recursive: true });
  for (const spec of specs) {
    if (!/^[a-z][a-z0-9-]{2,50}$/.test(spec.id))
      throw new Error(`Invalid primitive review ID: ${spec.id}`);
    await writeFile(
      resolve(directory, `${spec.id}.json`),
      JSON.stringify(spec, null, 2),
    );
    await writeFile(resolve(directory, `${spec.id}.svg`), svg(spec));
  }
  await writeFile(
    resolve(directory, "manifest.json"),
    JSON.stringify(
      {
        jobId,
        createdAt: new Date().toISOString(),
        primitives: specs.map((spec) => ({
          id: spec.id,
          label: spec.label,
          specification: `${spec.id}.json`,
          preview: `${spec.id}.svg`,
        })),
      },
      null,
      2,
    ),
  );
  return directory;
}
