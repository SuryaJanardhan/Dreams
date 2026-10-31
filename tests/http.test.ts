import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError, twice } from "../src/automation/operations/http.js";

test("quota exhaustion is never retried as if generation could repair it", async () => {
  let attempts = 0;
  await assert.rejects(
    twice(async () => {
      attempts += 1;
      throw new HttpError(429, "generativelanguage.googleapis.com", "quota");
    }),
    /Provider HTTP 429/,
  );
  assert.equal(attempts, 1);
});
