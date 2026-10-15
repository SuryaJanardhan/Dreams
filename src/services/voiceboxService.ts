import { spawn } from "child_process";
import path = require("path");
import fs = require("fs");
import logger = require("../config/logger.js");

/**
 * Service to generate cloned voice audio using the Voicebox Python backend.
 */
class VoiceboxService {
  voiceboxDir: string;
  pythonScript: string;

  constructor() {
    this.voiceboxDir = path.resolve(__dirname, "../../voicebox");
    this.pythonScript = path.join(this.voiceboxDir, "main.py");
  }

  /**
   * Generates a cloned voice audio file.
   * @param {string} text - The text to synthesize.
   * @param {string} refAudioPath - Path to the reference audio sample (e.g., Base-audio.mp3).
   * @param {string} outputPath - Path to save the generated audio.
   * @param {string} [instruct] - Optional style instruction.
   * @param {number} [speed] - Speech speed ratio (default: 0.9).
   * @returns {Promise<string>} - Path to the generated audio file.
   */
  async generateClonedVoice(
    text: string,
    refAudioPath: string,
    outputPath: string,
    refText: string | null = null,
    instruct: string | null = null,
    speed = 1.0,
  ) {
    if (!fs.existsSync(this.voiceboxDir)) {
      throw new Error(`Voicebox directory not found at: ${this.voiceboxDir}`);
    }

    const absRefAudioPath = path.resolve(refAudioPath);
    const absOutputPath = path.resolve(outputPath);

    logger.info(`🗣️ Starting Voicebox Synthesis...`);
    logger.debug(
      `Voicebox output=${absOutputPath} reference=${absRefAudioPath}`,
    );

    return new Promise<string>((resolve, reject) => {
      const args = [
        this.pythonScript,
        "--text",
        text,
        "--audio",
        absRefAudioPath,
        "--output",
        absOutputPath,
      ];
      if (refText) {
        args.push("--ref_text", refText);
      }
      if (instruct) {
        args.push("--instruct", instruct);
      }
      if (speed) {
        args.push("--speed", speed.toString());
      }

      const proc = spawn("python", args, { cwd: this.voiceboxDir });

      proc.stdout.on("data", (data) => {
        const output = data.toString().trim();
        if (output) logger.info(`[Voicebox] ${output}`);
      });

      proc.stderr.on("data", (data) => {
        const output = data.toString().trim();
        if (output) logger.debug(`[Voicebox Stderr] ${output}`);
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          logger.error(`❌ Voicebox Synthesis Failed with code ${code}`);
          return reject(new Error(`Voicebox failed with code ${code}`));
        }

        if (!fs.existsSync(absOutputPath)) {
          return reject(
            new Error(
              `Voicebox finished but output file was NOT found at: ${absOutputPath}`,
            ),
          );
        }

        const stats = fs.statSync(absOutputPath);
        logger.info(
          `✅ Voicebox Synthesis Successful: ${outputPath} (${(stats.size / 1024).toFixed(2)} KB)`,
        );
        resolve(absOutputPath);
      });
    });
  }
}

export = new VoiceboxService();
