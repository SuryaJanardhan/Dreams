import { present } from "../src/compat/guards.js";
import { failureInfo } from "../src/compat/errors.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs = require("fs");
// const { apikeys } = require("googleapis/build/src/apis/apikeys");

const genAI = new GoogleGenerativeAI("");

async function generateImage() {
  const contents =
    "Hi, can you create a 3d rendered image of a pig " +
    "with wings and a top hat flying over a happy " +
    "futuristic scifi city with lots of greenery?";

  // Set responseModalities to include "Image" so the model can generate
  const configuration: import("@google/generative-ai").GenerationConfig & {
    responseModalities: string[];
    aspectRatio: string;
  } = { responseModalities: ["Text", "Image"], aspectRatio: "9:8" };
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    generationConfig: configuration,
  });

  try {
    const response = await model.generateContent(contents);
    for (const part of present(
      present(response.response.candidates, "response.response.candidates")[0],
      "image candidate",
    ).content.parts) {
      // Based on the part type, either show the text or save the image
      if (part.text) {
        console.log(part.text);
      } else if (part.inlineData) {
        const imageData = part.inlineData.data;
        const buffer = Buffer.from(imageData, "base64");
        fs.writeFileSync("gemini-native-image.png", buffer);
        console.log("Image saved as gemini-native-image.png");
      }
    }
  } catch (error) {
    const caughtDetails0 = failureInfo(error);

    console.error("Error generating content:", error);
  }
}
generateImage();
