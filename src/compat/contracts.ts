import type { Request, Response, NextFunction } from "express";
export interface LegacyTask {
  rowId?: number | string;
  taskId?: string | undefined;
  rowIndex?: number;
  slide1?: string | undefined;
  slide2?: string | undefined;
  slide3?: string | undefined;
  sno?: string | number;
  idea?: string | undefined;
  topic?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  scripts?: string | undefined;
  status?: string | undefined;
  ytLink?: string | undefined;
  instaLink?: string | undefined;
  fbLink?: string | undefined;
  timestamp?: string | undefined;
}
export interface SocialLinks {
  youtubeUrl?: string | undefined;
  instagramUrl?: string | undefined;
  facebookUrl?: string | undefined;
  youtube?: string | undefined;
  instagram?: string | undefined;
  facebook?: string | undefined;
  yt?: string | undefined;
  insta?: string | undefined;
  fb?: string | undefined;
}
export interface SubtitleSettings {
  color?: string;
  bgColor?: string;
  paddingX?: number;
  paddingY?: number;
  fontSize?: number;
  fontFamily?: string;
  fontColor?: string;
  backgroundColor?: string;
  position?: string;
  outlineColor?: string;
  outlineWidth?: number;
  marginV?: number;
}
export interface LegacyRequestBody {
  apiKey?: string;
  modelName?: string;
  backgroundMusic?: string | null | undefined;
  subtitleSettings?: SubtitleSettings;
  topic?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  script?: string | undefined;
  videoPath?: string | undefined;
  imagePath?: string | undefined;
  audioPath?: string | undefined;
  idea?: string | undefined;
}
export type LegacyRequest = Request<
  Record<string, string>,
  unknown,
  LegacyRequestBody
>;
export type LegacyResponse = Response<unknown>;
export type LegacyNext = NextFunction;
export interface VoiceProfile {
  referenceAudioPath?: string | undefined;
  outputPath?: string | undefined;
  processedOutputPath?: string | undefined;
  rawAudioPath?: string | undefined;
  slowedAudioPath?: string | undefined;
  referenceText?: string | undefined;
  instruction?: string | undefined;
  speed?: number;
  slowdownRate?: number;
}
export interface NarrationResult {
  audioPath: string;
  rawAudioPath: string;
  provider: string;
  referenceAudioPath: string;
  durationSec: number | null;
}
export interface AudioSegment {
  text: string;
  file: string;
  duration: number;
}
export interface LegacyAudioFiles {
  conversationFile: string;
  segments?: AudioSegment[];
  rawAudioPath?: string;
  durationSec?: number | null;
}
export interface SubtitleItem {
  id?: number;
  start?: number;
  end?: number;
  startTime?: string | number | undefined;
  endTime?: string | number | undefined;
  text: string;
}
export interface LegacyImage {
  filename: string;
  timing?: { startTime: number; endTime: number };
  path?: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
  title?: string;
  url?: string;
}

export interface LegacyWorkflowState {
  taskId: string | null;
  status: string;
  currentStep: string | null;
  error: string | null;
  taskData: LegacyTask | null;
  results: {
    script?: string;
    scriptFilePath?: string;
    audioPath?: string;
    audioFiles?: LegacyAudioFiles;
    subtitles?: string;
    srtContent?: string;
    baseVideoPath?: string;
    reelContent?: string;
    finalVideo?: string;
    rootCopyPath?: string;
    images?: LegacyImage[];
    uploadResult?: LegacyPublishResult;
  };
}
export interface LegacyStaging {
  success: boolean;
  publicLink?: string;
  fileName?: string;
  error?: string;
}
export interface LegacyPublishResult {
  success: boolean;
  links: { yt: string; insta: string; fb: string };
  errors: { platform: string; message: string }[];
  staging: LegacyStaging | null;
  successCount: number;
  totalPlatforms?: number;
}
export interface CleanupResult {
  success: boolean;
  filesDeleted?: number;
  error?: string;
}
export interface LegacyPostResult {
  success: boolean;
  url?: string;
  error?: string | null;
}
export interface CarouselResults {
  error?: string;
  partialResults?: CarouselResults;
  instagram?: LegacyPostResult;
  facebook?: LegacyPostResult;
}
export interface LegacyReelOptions {
  baseVideo: string;
  outputPath?: string;
  audioPath?: string | null;
  images?: LegacyImage[];
  subtitles?: string;
  htmlContent?: string;
  backgroundMusic?: string | null | undefined;
  subtitleSettings?: SubtitleSettings;
}
