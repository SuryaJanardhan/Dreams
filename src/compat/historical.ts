/** Optional historical exports: retain explicit failure when the original module has no method. */
import type imageService = require("../services/imageService.js");
import type { LegacyImage, SubtitleItem } from "./contracts.js";
export interface ImageSegment {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
}
export interface ImageChunk extends ImageSegment {
  duration: number;
  term: string;
  appearances: number;
  subtitleCount: number;
}
export interface HistoricalImageExports {
  parseSRTFile(path: string): ImageSegment[];
  extractTechnicalTerms(text: string): Promise<string[]>;
  createImageChunksFromSubtitles(
    segments: ImageSegment[],
    duration?: number,
  ): ImageChunk[];
  createDynamicImageChunksFromTerms(
    a: ImageSegment[] | string[],
    b: ImageSegment[] | string[],
    maxChunks?: number,
  ): ImageChunk[];
  generateSimpleImagePrompts(terms: string[]): Promise<string[]>;
  generateImagePromptsWithGemini(script: string): Promise<string[]>;
  generateImages(
    srt: string | null,
    script: string,
    topic?: string,
  ): Promise<string[]>;
}
function deferred<A extends unknown[], R>(
  method: ((...args: A) => R) | undefined,
  name: string,
): (...args: A) => R {
  return (...args: A) => {
    if (!method) throw new TypeError(`${name} is not a function`);
    return method(...args);
  };
}
export function historicalImages(module: typeof imageService) {
  const legacy: typeof imageService & Partial<HistoricalImageExports> = module;
  return {
    ...module,
    parseSRTFile: deferred(legacy.parseSRTFile, "parseSRTFile"),
    extractTechnicalTerms: deferred(
      legacy.extractTechnicalTerms,
      "extractTechnicalTerms",
    ),
    createImageChunksFromSubtitles: deferred(
      legacy.createImageChunksFromSubtitles,
      "createImageChunksFromSubtitles",
    ),
    createDynamicImageChunksFromTerms: deferred(
      legacy.createDynamicImageChunksFromTerms,
      "createDynamicImageChunksFromTerms",
    ),
    generateSimpleImagePrompts: deferred(
      legacy.generateSimpleImagePrompts,
      "generateSimpleImagePrompts",
    ),
    generateImagePromptsWithGemini: deferred(
      legacy.generateImagePromptsWithGemini,
      "generateImagePromptsWithGemini",
    ),
    generateImages: deferred(legacy.generateImages, "generateImages"),
  };
}
export function historicalSubtitleWriter(module: object) {
  const optional: {
    createSubtitlesFile?: (
      data: string | SubtitleItem[],
      path: string,
    ) => Promise<string> | string;
  } = module;
  return deferred(optional.createSubtitlesFile, "createSubtitlesFile");
}
export function missingWorkflowImages(
  _srt: string | null,
  _script: string,
): Promise<LegacyImage[]> {
  throw new ReferenceError("generateImages is not defined");
}
