import type { LegacyTask } from "../compat/contracts.js";
import { failureInfo } from "../compat/errors.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import logger = require("../config/logger.js");

const MODEL_ID = "gemini-2.5-flash"; // User requested 2.5 flash dont change
const VISUALS_MODEL_ID = "gemini-2.5-pro"; // user requested 2.5 pro dont change
const GROQ_SCRIPT_MODEL_ID = "llama-3.3-70b-versatile";

const getGeminiKeys = () => {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_FOR_VISUALS,
    process.env.GEMINI_API_KEY_FOR_T2T,
  ].filter((key): key is string => Boolean(key));
  return [...new Set(keys)];
};

async function generateWithGeminiFallback(prompt: string, modelId = MODEL_ID) {
  let lastError;
  const keys = getGeminiKeys();

  if (keys.length === 0) {
    throw new Error("No Gemini API keys are configured");
  }

  for (const key of keys) {
    try {
      const genAI = new GoogleGenerativeAI(key);
      const currentModel = genAI.getGenerativeModel({ model: modelId });
      const result = await currentModel.generateContent(prompt);
      const response = await result.response;
      return {
        text: response.text().trim(),
        provider: "gemini",
        model: modelId,
      };
    } catch (e) {
      const caughtDetails0 = failureInfo(e);

      lastError = e;
      const msg = caughtDetails0.message || "";
      if (
        msg.includes("API_KEY_INVALID") ||
        msg.includes("expired") ||
        msg.includes("429") ||
        msg.includes("fetch")
      ) {
        logger.warn(
          `⚠️ Gemini Key failed, trying next... Error: ${msg.substring(0, 50)}`,
        );
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

function normalizeTask(taskOrTopic: LegacyTask | string, description = "") {
  if (typeof taskOrTopic === "string") {
    return {
      idea: taskOrTopic,
      description,
    };
  }

  return {
    ...taskOrTopic,
    idea: taskOrTopic?.idea || taskOrTopic?.topic || taskOrTopic?.title || "",
    description: taskOrTopic?.description || description || "",
  };
}

function getWordCount(text: string) {
  return text.split(/\s+/).filter((word: string) => word.length > 0).length;
}

function cleanGeneratedScript(script: string) {
  const lines = script.split("\n");
  const filteredLines = lines.filter((line: string) => {
    const lower = line.toLowerCase();
    if (lower.includes("here is") && lower.includes("script")) return false;
    if (lower.includes("word count") || lower.includes("words long"))
      return false;
    if (lower.startsWith("note:") || lower.startsWith("script:")) return false;
    return true;
  });

  return filteredLines
    .join(" ")
    .trim()
    .replace(/\[.*?\]/g, "")
    .replace(/\*+/g, "")
    .replace(/Hook:|Gap:|Value:|Loop:/gi, "")
    .trim();
}

function buildScriptPrompt(task: { idea: string; description: string }) {
  return `
    TASK: Write a 60-second spoken narration script for a technical educational reel.
    TOPIC: ${task.idea}
    ${task.description ? `CONTEXT: ${task.description}` : ""}

    CRITICAL RULES:
    1. **SIMPLE ENGLISH**: Use very simple, easy-to-understand English. Avoid big words and complex sentences.
    2. **EXPLAIN LIKE A FRIEND**: Speak naturally. Explain things simply, as if you are talking to a friend who is new to the topic.
    3. **KEEP TECHNICAL TERMS**: Use the correct technical words (like "API", "Load Balancer"), but explain everything else in the simplest way possible.
    4. NO introductions like "Hey guys", "Welcome", or "Today we will".
    5. NO outros like "Follow for more" or "Let me know".
    6. Spell out acronyms the first time (e.g., "Application Programming Interface").
    7. OUTPUT ONLY THE SPOKEN WORDS. No titles, meta-commentary, or formatting.

    STYLE:
    - Clear and direct. Every sentence should teach one simple thing.
    - Single continuous paragraph. No line breaks or bullet points.
    - Use clear periods and commas for natural TTS pauses.

    WORD COUNT: Strictly between 140 and 160 words.
  `;
}

function buildVisualPrompt(topic: string, scriptText?: string) {
  return `
    Task: Create a clear and simple visual plan for a technical reel.
    Topic: ${topic}
    Script: ${scriptText}

    BASE VISUAL PROMPT:
    "Cinematic abstract visualization of ${topic}, minimalist tech-noir aesthetic, deep obsidian and charcoal color palette, high-contrast lighting with subtle neon accents, sharp macro photography style, sleek matte textures, sophisticated data-driven motion, clean geometric lines, professional studio atmosphere, ultra-modern, zero human figures, zero text."

    VISUAL STRATEGY:
    - **STYLE**: Clean, modern, and very easy to follow.
    - **SIMPLE LANGUAGE**: Describe visuals in simple English.
    - BACKGROUND: Deep dark background with subtle glowing lines.
    - COMPONENTS: Technical items should be in clear, glowing boxes.
    - NO OVERLAP: Make sure no text or icons cover each other.
    - CONNECTIONS: Clearly describe how lines connect components.
    - MATCH THE SCRIPT: Visuals must match the words being spoken.

    OUTPUT FORMAT:
    - Exactly 5-6 simple lines describing the visual steps.
    - Focus on clear actions like "Show a spinning icon".
    `;
}

async function generateScriptWithGroq(prompt: string, originalError: unknown) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      `Script generation failed. Gemini unavailable (${failureInfo(originalError).message}) and GROQ_API_KEY is missing for fallback.`,
    );
  }

  try {
    const Groq = require("groq-sdk");
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt + "\nRespond with ONLY the script text.",
        },
      ],
      model: GROQ_SCRIPT_MODEL_ID,
    });

    logger.info("✨ Script generated via Groq fallback");
    return {
      text: chatCompletion.choices[0].message.content.trim(),
      provider: "groq",
      model: GROQ_SCRIPT_MODEL_ID,
    };
  } catch (groqErr) {
    const caughtDetails1 = failureInfo(groqErr);

    logger.error(
      "❌ Groq fallback also failed for script:",
      caughtDetails1.message,
    );
    throw originalError;
  }
}

async function generateScriptForTask(
  taskOrTopic: LegacyTask | string,
  description = "",
) {
  const task = normalizeTask(taskOrTopic, description);
  const prompt = buildScriptPrompt(task);

  let result;
  try {
    result = await generateWithGeminiFallback(prompt, MODEL_ID);
  } catch (error) {
    const caughtDetails2 = failureInfo(error);

    logger.warn(`⚠️ Script Gemini failed, trying Groq fallback...`);
    result = await generateScriptWithGroq(prompt, error);
  }

  const finalScript = cleanGeneratedScript(result.text);
  const wordCount = getWordCount(finalScript);
  logger.info(`✨ Viral Script generated (Word count: ${wordCount})`);

  return {
    script: finalScript,
    provider: result.provider,
    model: result.model,
    wordCount,
  };
}

/**
 * Generates a high-fidelity visual animation storyboard prompt for technical reels.
 */
async function generateVisualPromptForTask(
  taskOrTopic: LegacyTask | string,
  scriptText?: string,
) {
  const task = normalizeTask(taskOrTopic);
  const prompt = buildVisualPrompt(task.idea, scriptText);

  try {
    const result = await generateWithGeminiFallback(prompt, VISUALS_MODEL_ID);
    return {
      visualPrompt: result.text,
      provider: result.provider,
      model: result.model,
    };
  } catch (e) {
    const caughtDetails3 = failureInfo(e);

    logger.error(`❌ Visual prompt Gemini failed: ${caughtDetails3.message}`);
    throw e;
  }
}

async function generateScript(topic: string, description = "") {
  const result = await generateScriptForTask(topic, description);
  return result.script;
}

async function generateVisualPrompt(topic: string, scriptText?: string) {
  const result = await generateVisualPromptForTask(topic, scriptText);
  return result.visualPrompt;
}

export = {
  generateScript,
  generateScriptForTask,
  generateVisualPrompt,
  generateVisualPromptForTask,
};
