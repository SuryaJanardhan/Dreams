import { once } from "node:events";
import type { Writable } from "node:stream";

export async function writeWithBackpressure(
  stream: Writable,
  buffer: Buffer,
  completion: Promise<void>,
) {
  if (stream.write(buffer)) return;
  await Promise.race([
    once(stream, "drain"),
    completion.then(() => {
      throw new Error("Encoder ended before all frames were written");
    }),
  ]);
}
