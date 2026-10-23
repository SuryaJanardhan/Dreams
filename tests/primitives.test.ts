import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { writePrimitiveReviewArtifacts } from "../src/automation/primitives/index.js";

test("primitive review artifacts contain the validated spec and SVG preview", async () => {
  const root = await mkdtemp(resolve(process.cwd(), ".primitive-review-test-"));
  try {
    const directory = await writePrimitiveReviewArtifacts(root, "job-123", [
      {
        id: "packet-fragment",
        label: "Packet fragment",
        shapes: [
          {
            kind: "rect",
            x: 10,
            y: 20,
            width: 30,
            height: 20,
            semantic: "active",
          },
          {
            kind: "line",
            x: 40,
            y: 30,
            width: 25,
            height: 0,
            semantic: "structure",
          },
        ],
      },
    ]);
    const specification = JSON.parse(
      await readFile(resolve(directory, "packet-fragment.json"), "utf8"),
    ) as unknown;
    assert.deepEqual(specification, {
      id: "packet-fragment",
      label: "Packet fragment",
      shapes: [
        {
          kind: "rect",
          x: 10,
          y: 20,
          width: 30,
          height: 20,
          semantic: "active",
        },
        {
          kind: "line",
          x: 40,
          y: 30,
          width: 25,
          height: 0,
          semantic: "structure",
        },
      ],
    });
    const preview = await readFile(
      resolve(directory, "packet-fragment.svg"),
      "utf8",
    );
    assert.match(preview, /<rect/);
    assert.match(preview, /<line x1="40" y1="30" x2="65" y2="30"/);
    assert.match(
      await readFile(resolve(directory, "manifest.json"), "utf8"),
      /packet-fragment\.svg/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
