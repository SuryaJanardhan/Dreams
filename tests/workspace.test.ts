import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "../src/automation/workspace/index.js";
test("job cleanup removes only generated workspace and rejects path traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "dreams-isolation-"));
  await writeFile(join(root, "reference.txt"), "keep");
  const workspace = await createWorkspace(root, "job-1");
  await writeFile(workspace.file("generated.wav"), "delete");
  assert.throws(() => workspace.file("../reference.txt"), /escape/);
  await assert.rejects(createWorkspace(root, "../other"), /Invalid/);
  await workspace.cleanup();
  await access(join(root, "reference.txt"));
  await assert.rejects(access(workspace.path));
  await rm(root, { recursive: true });
});
