import { SchemaType } from "@google/generative-ai";
import type { Schema } from "@google/generative-ai";
import { z } from "zod";
import type { AudioSegment } from "../compat/contracts.js";
import { failureInfo } from "../compat/errors.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs = require("fs");
import path = require("path");

// Format timestamp for SRT (00:00:00,000)
const formatSRTTimestamp = (seconds: number) => {
  const date = new Date(0);
  date.setMilliseconds(seconds * 1000);
  const iso = date.toISOString();
  // ISO is YYYY-MM-DDTHH:mm:ss.sssZ, return HH:mm:ss,sss
  const timePart = iso.substr(11, 12).replace(".", ",");
  return timePart;
};

// Generate SRT using Gemini Flash
const generateSRT = async (audioPath: string, apiKey: string) => {
  if (!fs.existsSync(audioPath))
    throw new Error(`Audio file not found: ${audioPath}`);

  const audioData = fs.readFileSync(audioPath);
  const base64Data = audioData.toString("base64");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Strict schema for subtitles
  const subtitleSchema: Schema = {
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.OBJECT,
      properties: {
        start: {
          type: SchemaType.NUMBER,
          description: "Start time in seconds",
        },
        end: { type: SchemaType.NUMBER, description: "End time in seconds" },
        text: { type: SchemaType.STRING, description: "The spoken text" },
      },
      required: ["start", "end", "text"],
    },
  };

  try {
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "audio/wav", // Assuming WAV from AudioService
                data: base64Data,
              },
            },
            {
              text: `You are a professional captioning assistant. Extract the transcript with EXTREME TIMING PRECISION.
              CRITICAL RULES:
              1. Timestamps must align perfectly with the audio.
              2. Break text into naturally spoken short chunks (max 3-5 words).
              3. Do NOT hallucinate.
              4. If silence, do not create segments.`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: subtitleSchema,
      },
    });

    const response = await result.response;
    let jsonString = response.text() || "[]";
    if (!response.text)
      jsonString = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    const segments = z
      .array(
        z.object({
          start: z.coerce.number(),
          end: z.coerce.number(),
          text: z.string(),
        }),
      )
      .parse(JSON.parse(jsonString || "[]"));

    let srtOutput = "";
    segments.forEach((seg, index: number) => {
      const id = index + 1;
      const startTime = formatSRTTimestamp(seg.start);
      const endTime = formatSRTTimestamp(seg.end);
      const text = seg.text.trim();
      srtOutput += `${id}\n${startTime} --> ${endTime}\n${text}\n\n`;
    });

    return { srt: srtOutput.trim(), segments };
  } catch (error) {
    const caughtDetails0 = failureInfo(error);

    console.error("SRT Generation Error:", error);
    throw error;
  }
};

const constructPrompt = (
  topic: string,
  srt: string,
  visualPrompt: string,
  theme: { primary: string; accent: string; background: string; name: string },
) => {
  return `
I am creating an Instagram Reel that combines a speaker video with dynamic HTML overlays.
You are a Creative Director and Frontend Developer.

### STYLE & THEME
Color Palette:
- Primary: ${theme.primary}
- Accent: ${theme.accent}
- Background: ${theme.background}

Visual Concept (from external Creative Director):
"${visualPrompt}"

### INPUTS
Topic: ${topic || "General Content"}
Transcript (SRT):
${srt}

### OUTPUT REQUIREMENTS
1. HTML/CSS/JS Animation (GSAP):
   - Use GSAP for animations.
   - Listen for 'timeupdate', 'play', 'pause' events via window.addEventListener('message', ...).
   - USE THE PROVIDED COLOR PALETTE (${theme.name}).
   - 9:16 Portrait Aspect Ratio.
   - Must be a single self-contained HTML string.
   - **IMPORTANT**: If in 'split' mode, the layout will be 40% (0.4) video and 60% (0.6) HTML. Ensure your CSS and animations account for this.
   
2. Layout Configuration (JSON):
   - Define when to show HTML vs Video.
   - List of objects with startTime, endTime, layoutMode ('split', 'full-video', 'full-html'), splitRatio (FOR MODE 'split', ALWAYS USE 0.4).

Return JSON with keys: "html", "layoutConfig".
`;
};

// Generate Reel Content (HTML + Layout)
const generateReelContent = async (
  srtText: string,
  topicContext: string,
  apiKey = process.env.GEMINI_API_KEY_FOR_VISUALS || process.env.GEMINI_API_KEY,
  modelName = "gemini-2.5-flash",
  visualPrompt = "Dynamic and modern",
  theme = {
    primary: "#00f3ff",
    accent: "#ff0055",
    background: "#050505",
    name: "Default",
  },
) => {
  const ai = new GoogleGenerativeAI(apiKey ?? "");
  const model = ai.getGenerativeModel({ model: modelName });
  const prompt = constructPrompt(topicContext, srtText, visualPrompt, theme);

  const layoutStepSchema: Schema = {
    type: SchemaType.OBJECT,
    properties: {
      startTime: { type: SchemaType.NUMBER },
      endTime: { type: SchemaType.NUMBER },
      layoutMode: {
        type: SchemaType.STRING,
        format: "enum",
        enum: ["split", "full-video", "full-html", "pip-html"],
      },
      splitRatio: { type: SchemaType.NUMBER },
      captionPosition: {
        type: SchemaType.STRING,
        format: "enum",
        enum: ["top", "bottom", "center", "hidden"],
      },
      note: { type: SchemaType.STRING },
    },
    required: [
      "startTime",
      "endTime",
      "layoutMode",
      "splitRatio",
      "captionPosition",
    ],
  };

  const responseSchema: Schema = {
    type: SchemaType.OBJECT,
    properties: {
      html: { type: SchemaType.STRING },
      layoutConfig: { type: SchemaType.ARRAY, items: layoutStepSchema },
      reasoning: { type: SchemaType.STRING },
    },
    required: ["html", "layoutConfig"],
  };

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const response = await result.response;
    const resultJson = JSON.parse(response.text() || "{}");

    // Inject ReelHelper
    if (resultJson.html) {
      const reelHelperScript = `<script>
            (function() {
                if (typeof HTMLCollection !== 'undefined' && !HTMLCollection.prototype.forEach) {
                    HTMLCollection.prototype.forEach = Array.prototype.forEach;
                }
                if (typeof NodeList !== 'undefined' && !NodeList.prototype.forEach) {
                    NodeList.prototype.forEach = Array.prototype.forEach;
                }
                window.ReelHelper = {
                    select: function(selector, context) {
                        if (!window.gsap) return [];
                        return gsap.utils.toArray(selector, context);
                    },
                    clear: function(element) {
                        if(element) element.innerHTML = '';
                    }
                };
            })();
        </script>`;
      resultJson.html = resultJson.html.replace(
        "<head>",
        "<head>" + reelHelperScript,
      );
    }

    return resultJson;
  } catch (error) {
    const caughtDetails1 = failureInfo(error);

    console.error("Gemini Generation Error:", error);
    throw error;
  }
};

export = {
  generateSRT,
  generateReelContent,
};
