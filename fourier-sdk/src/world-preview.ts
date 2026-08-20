import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompiledVisualArtifact } from "@fourier-video/core/artifact";
import { sdkArtifactHost } from "./artifact-host.ts";
import { sdkFail } from "./errors.ts";

const { renderVisualArtifactVideo } = sdkArtifactHost;

export const MAX_WORLD_PREVIEW_BYTES = 32 * 1024 * 1024;
const WORLD_PREVIEW_DOM_PAGES = 3;

export interface WorldPreviewVideo {
  readonly bytes: Uint8Array;
  readonly mimeType: "video/mp4";
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly totalFrames: number;
  readonly durationSeconds: number;
}

export async function renderWorldPreviewVideo(
  artifact: CompiledVisualArtifact,
  options: { readonly ffmpegPath?: string } = {},
): Promise<WorldPreviewVideo> {
  const directory = await mkdtemp(join(tmpdir(), "fourier-world-preview-"));
  const output = join(directory, "preview.mp4");
  try {
    const result = await renderVisualArtifactVideo(artifact, {
      output,
      overwrite: true,
      crf: 26,
      preset: "medium",
      domPages: WORLD_PREVIEW_DOM_PAGES,
      ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
    });
    if (result.byteLength > MAX_WORLD_PREVIEW_BYTES) {
      sdkFail(
        "WORLD_PREVIEW_TOO_LARGE",
        `本地渲染的预览 MP4 不能超过 ${MAX_WORLD_PREVIEW_BYTES} bytes`,
        { byteLength: result.byteLength, maximum: MAX_WORLD_PREVIEW_BYTES },
      );
    }
    return Object.freeze({
      bytes: new Uint8Array(await readFile(output)),
      mimeType: "video/mp4" as const,
      sha256: result.sha256,
      width: result.width,
      height: result.height,
      fps: result.fps,
      totalFrames: result.totalFrames,
      durationSeconds: result.durationSeconds,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
