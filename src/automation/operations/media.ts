import { spawn } from "node:child_process";
import { z } from "zod";
import { message } from "../domain.js";
export async function command(
  executable: string,
  args: string[],
  signal: AbortSignal,
  cwd?: string,
): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      ...(cwd ? { cwd } : {}),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let errors = "";
    let timer: NodeJS.Timeout | undefined;
    const abort = () => {
      child.kill("SIGTERM");
      timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      timer.unref();
    };
    signal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (buffer: Buffer) => {
      output = (output + buffer.toString()).slice(-200000);
    });
    child.stderr.on("data", (buffer: Buffer) => {
      errors = (errors + buffer.toString()).slice(-4000);
    });
    const finish = () => {
      signal.removeEventListener("abort", abort);
      if (timer) clearTimeout(timer);
    };
    child.on("error", (error) => {
      finish();
      reject(error);
    });
    child.on("close", (code) => {
      finish();
      code === 0 && !signal.aborted
        ? resolve(output)
        : reject(
            new Error(
              `${executable} ${signal.aborted ? "cancelled" : `exited ${code}`}: ${errors}`,
            ),
          );
    });
    if (signal.aborted) abort();
  });
}
const probeSchema = z.object({
  format: z.object({ duration: z.coerce.number().positive() }),
  streams: z.array(
    z.object({
      codec_type: z.string(),
      codec_name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      sample_rate: z.coerce.number().optional(),
      r_frame_rate: z.string().optional(),
    }),
  ),
});
export async function probe(path: string, signal: AbortSignal) {
  const text = await command(
    "ffprobe",
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", path],
    signal,
  );
  const value: unknown = JSON.parse(text);
  return probeSchema.parse(value);
}
export async function assertAudio(path: string, signal: AbortSignal) {
  const info = await probe(path, signal);
  const audio = info.streams.find((stream) => stream.codec_type === "audio");
  if (!audio?.sample_rate || audio.sample_rate < 16000)
    throw new Error("Narration lacks a valid audio stream/sample rate");
  const output = await command(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      path,
      "-af",
      "astats=metadata=1:reset=0",
      "-f",
      "null",
      "-",
    ],
    signal,
  ).catch((error) => {
    throw new Error(message(error));
  });
  // astats emits on stderr; audible-energy checks are performed by the Python engine before saving.
  void output;
  return { duration: info.format.duration, sampleRate: audio.sample_rate };
}
