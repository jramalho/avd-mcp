import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import type { AdbRunner } from "../adb/runner.js";
import { ToolError } from "../shared/errors/tool-error.js";
import { MediaArtifacts } from "./media-artifacts.js";

export type ScreenshotCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScreenshotAnnotation = {
  text: string;
  x: number;
  y: number;
};

export type ScreenshotInput = {
  serial?: string;
  crop?: ScreenshotCrop;
  compressQuality?: number;
  annotate?: ScreenshotAnnotation[];
  inlineBase64: boolean;
};

export type ScreenshotOutput = {
  traceId: string;
  serial?: string;
  localPath: string;
  width: number;
  height: number;
  durationMs: number;
  inlineBase64?: string;
};

function ensureQuality(quality?: number) {
  if (quality === undefined) return undefined;
  if (!Number.isFinite(quality) || quality < 0 || quality > 100) {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: "compressQuality deve estar entre 0 e 100.",
      technicalDetails: `compressQuality=${quality}`,
    });
  }
  return Math.round(quality);
}

function ensureCrop(crop?: ScreenshotCrop) {
  if (!crop) return undefined;
  const values = [crop.x, crop.y, crop.width, crop.height];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: "crop inválido.",
    });
  }

  if (crop.width <= 0 || crop.height <= 0) {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: "crop.width e crop.height devem ser maiores que zero.",
    });
  }

  return {
    left: Math.max(0, Math.floor(crop.x)),
    top: Math.max(0, Math.floor(crop.y)),
    width: Math.floor(crop.width),
    height: Math.floor(crop.height),
  };
}

function ensureAnnotations(annotations?: ScreenshotAnnotation[]) {
  if (!annotations) return [];
  return annotations
    .filter((item) => typeof item.text === "string" && item.text.trim().length > 0)
    .map((item) => ({
      text: item.text,
      x: Math.floor(item.x),
      y: Math.floor(item.y),
    }));
}

function buildSvgAnnotation(width: number, height: number, annotations: ScreenshotAnnotation[]) {
  const lines = annotations
    .map(
      (item) => `<text x="${item.x}" y="${item.y}" font-size="24" fill="red" stroke="black" stroke-width="0.5">${item.text}</text>`
    )
    .join("\n");

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`;
}

export class ScreenshotService {
  constructor(
    private readonly adbRunner: AdbRunner,
    private readonly artifacts: MediaArtifacts
  ) {}

  async capture(input: ScreenshotInput): Promise<ScreenshotOutput> {
    const startedAt = Date.now();
    const traceId = randomUUID();
    const crop = ensureCrop(input.crop);
    const quality = ensureQuality(input.compressQuality);
    const annotations = ensureAnnotations(input.annotate);

    const adbResult = await this.adbRunner.runAdbCommand({
      ...(input.serial ? { serial: input.serial } : {}),
      args: ["exec-out", "screencap", "-p"],
      timeoutMs: 30_000,
      responseType: "binary",
    });

    if (adbResult.exitCode !== 0 || adbResult.stdoutBuffer.length === 0) {
      throw new ToolError({
        code: "SCREENSHOT_CAPTURE_FAILED",
        message: "Falha ao capturar screenshot.",
        technicalDetails: adbResult.stderr || `exitCode=${adbResult.exitCode}`,
      });
    }

    let image = sharp(adbResult.stdoutBuffer, { failOn: "none" });

    if (crop) {
      image = image.extract(crop);
    }

    const metadata = await image.metadata();
    const width = crop?.width ?? metadata.width ?? 0;
    const height = crop?.height ?? metadata.height ?? 0;

    if (annotations.length > 0 && width > 0 && height > 0) {
      const svg = buildSvgAnnotation(width, height, annotations);
      image = image.composite([{ input: Buffer.from(svg) }]);
    }

    const compressionLevel = quality === undefined
      ? 6
      : Math.max(0, Math.min(9, Math.round((100 - quality) / 11.11)));

    const pngBuffer = await image.png({ compressionLevel }).toBuffer();

    await this.artifacts.ensureDirs();
    const fileName = `${Date.now()}_${traceId}.png`;
    const localPath = join(this.artifacts.getScreenshotsDir(), fileName);
    await writeFile(localPath, pngBuffer);

    const output: ScreenshotOutput = {
      traceId,
      ...(input.serial ? { serial: input.serial } : {}),
      localPath,
      width,
      height,
      durationMs: Date.now() - startedAt,
    };

    if (input.inlineBase64) {
      output.inlineBase64 = pngBuffer.toString("base64");
    }

    return output;
  }
}
