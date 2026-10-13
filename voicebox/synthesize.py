"""Minimal, uncached CPU Voicebox inference contract for Actions."""
import argparse
import json
import resource
from pathlib import Path
import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel


def synthesize(args):
    model = Qwen3TTSModel.from_pretrained(
        f"Qwen/Qwen3-TTS-12Hz-{args.model_size}-Base",
        device_map="cpu", torch_dtype=torch.float32, attn_implementation="eager",
    )
    prompt = model.create_voice_clone_prompt(ref_audio=args.reference, ref_text=args.transcript)
    # The Base clone model may not support delivery instructions; never substitute another model.
    waves, sample_rate = model.generate_voice_clone(
        text=args.text, language="English", voice_clone_prompt=prompt,
    )
    audio = np.asarray(waves[0], dtype=np.float32)
    if audio.size == 0 or not np.all(np.isfinite(audio)):
        raise ValueError("Generated audio is empty or non-finite")
    rms = float(np.sqrt(np.mean(np.square(audio))))
    peak = float(np.max(np.abs(audio)))
    if rms < 0.001 or peak <= 0:
        raise ValueError("Generated narration is silent")
    clipped = float(np.mean(np.abs(audio) >= 0.999))
    if clipped > 0.01:
        raise ValueError("More than one percent of narration samples are clipped")
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    sf.write(args.output, audio, sample_rate)
    print(json.dumps({"path": str(Path(args.output).resolve()), "duration": len(audio) / sample_rate,
                      "sampleRate": sample_rate, "rms": rms, "peak": peak, "peakRssMb": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", required=True)
    parser.add_argument("--reference", required=True)
    parser.add_argument("--transcript", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model-size", choices=["1.7B", "0.6B"], default="1.7B")
    synthesize(parser.parse_args())
