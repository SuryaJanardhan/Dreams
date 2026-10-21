import { spawn } from "node:child_process";
import { z } from "zod";
export async function command(
  executable: string,
  args: string[],
  signal: AbortSignal,
  cwd?: string,
  capture: "stdout" | "stderr" = "stdout",
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
        ? resolve(capture === "stderr" ? errors : output)
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
  const stats = await command(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      path,
      "-af",
      "astats=metadata=0:reset=0",
      "-f",
      "null",
      "-",
    ],
    signal,
    undefined,
    "stderr",
  );
  const rms = Number(
    [...stats.matchAll(/RMS level dB:\s*(-?[\d.]+|-inf)/g)].at(-1)?.[1],
  );
  if (!Number.isFinite(rms) || rms < -55)
    throw new Error("Narration has no measurable audible energy");
  const peak = Number(
    [...stats.matchAll(/Peak level dB:\s*(-?[\d.]+|-inf)/g)].at(-1)?.[1],
  );
  const flatFactor = Number(
    [...stats.matchAll(/Flat factor:\s*(-?[\d.]+|-inf)/g)].at(-1)?.[1],
  );
  if (
    !Number.isFinite(peak) ||
    (peak > -0.1 && Number.isFinite(flatFactor) && flatFactor > 0.1)
  )
    throw new Error("Narration contains clipped samples");
  return { duration: info.format.duration, sampleRate: audio.sample_rate };
}

export async function measureMix(path: string, signal: AbortSignal) {
  const diagnostics = await command(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      path,
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
      "-f",
      "null",
      "-",
    ],
    signal,
    undefined,
    "stderr",
  );
  const block = diagnostics.match(/\{[\s\S]*\}/)?.[0];
  if (!block) throw new Error("Final mix loudness measurement missing");
  const value: unknown = JSON.parse(block);
  const measured = z
    .object({
      input_i: z.coerce.number().finite(),
      input_tp: z.coerce.number().finite(),
      input_lra: z.coerce.number().nonnegative(),
    })
    .parse(value);
  if (
    measured.input_i < -35 ||
    measured.input_i > -8 ||
    measured.input_tp > -1.2
  )
    throw new Error("Final mix loudness/true peak is outside safe bounds");
  return {
    integratedLufs: measured.input_i,
    truePeakDb: measured.input_tp,
    loudnessRange: measured.input_lra,
  };
}
