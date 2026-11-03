import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { Groq } from "../src/automation/ai/groq.js";
import {
  Http,
  HttpError,
  type Request,
} from "../src/automation/operations/http.js";

class GroqHttpFixture extends Http {
  calls: Array<{ authorization: string; body: string }> = [];
  constructor(
    private readonly behavior: Record<string, "ok" | "quota" | "invalid"> = {},
  ) {
    super(() => new AbortController().signal);
  }
  override async response(_url: string, request: Request = {}) {
    const authorization = request.headers?.Authorization ?? "";
    const key = authorization.replace(/^Bearer\s+/, "");
    this.calls.push({ authorization, body: String(request.body ?? "") });
    if (this.behavior[key] === "quota")
      throw new HttpError(429, "api.groq.com", "quota exhausted");
    const content = JSON.stringify({
      value: this.behavior[key] === "invalid" ? 42 : key,
    });
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
}
const resultSchema = z.object({ value: z.string() });
const config = {
  keys: ["key-a", "key-b", "key-c"],
  model: "qwen/qwen3.8-27b",
};

test("Groq distributes logical requests round-robin across configured keys", async () => {
  const http = new GroqHttpFixture();
  const groq = new Groq(config, http);
  assert.equal((await groq.generate("one", resultSchema)).value, "key-a");
  assert.equal((await groq.generate("two", resultSchema)).value, "key-b");
  assert.equal((await groq.generate("three", resultSchema)).value, "key-c");
});
test("Groq advances to another key on quota exhaustion", async () => {
  const http = new GroqHttpFixture({ "key-a": "quota" });
  const groq = new Groq(config, http);
  assert.equal((await groq.generate("one", resultSchema)).value, "key-b");
  assert.deepEqual(
    http.calls.map((call) => call.authorization),
    ["Bearer key-a", "Bearer key-b"],
  );
});
test("schema-invalid model output is not hidden by key rotation", async () => {
  const http = new GroqHttpFixture({ "key-a": "invalid" });
  const groq = new Groq(config, http);
  await assert.rejects(groq.generate("one", resultSchema), /expected string/i);
  assert.equal(http.calls.length, 1);
});
test("Groq vision sends the local image as a data URL", async () => {
  const directory = `/tmp/dreams-groq-test-${process.pid}`;
  await mkdir(directory, { recursive: true });
  const imagePath = `${directory}/frame.png`;
  await writeFile(imagePath, Buffer.from([137, 80, 78, 71]));
  const http = new GroqHttpFixture();
  await new Groq(config, http).vision(
    "review",
    imagePath,
    "image/png",
    resultSchema,
  );
  assert.match(http.calls[0]?.body ?? "", /data:image\/png;base64,iVBORw==/);
});
