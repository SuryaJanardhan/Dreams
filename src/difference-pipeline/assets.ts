import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { z } from "zod";

const manifestSchema = z.object({
  version: z.literal(1),
  provenance: z.object({
    kind: z.literal("project-generated"),
    sourceRecord: z.string().regex(/^mascot\/source\.json$/),
    ownershipBasis: z.string().min(20),
    permittedUse: z.literal("approved-for-public-social-media"),
  }),
  assets: z.array(
    z.object({
      id: z.string().min(1),
      path: z.string().regex(/^mascot\/[a-z-]+\.png$/),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      width: z.literal(512),
      height: z.literal(512),
      purpose: z.literal("mascot-pose"),
    }),
  ),
});

export async function validateAssetPack(root: string) {
  const directory = resolve(root, "assets/difference-pipeline");
  const raw: unknown = JSON.parse(
    await readFile(resolve(directory, "asset-manifest.json"), "utf8"),
  );
  const manifest = manifestSchema.parse(raw);
  await readFile(resolve(directory, manifest.provenance.sourceRecord), "utf8");
  const validated = new Map<string, string>();
  for (const asset of manifest.assets) {
    const path = resolve(directory, asset.path);
    const bytes = await readFile(path);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== asset.sha256)
      throw new Error(`Asset hash mismatch: ${asset.id}`);
    const metadata = await sharp(bytes).metadata();
    if (
      metadata.format !== "png" ||
      metadata.width !== asset.width ||
      metadata.height !== asset.height ||
      !metadata.hasAlpha
    )
      throw new Error(`Asset format mismatch: ${asset.id}`);
    validated.set(asset.id, path);
  }
  return validated;
}
