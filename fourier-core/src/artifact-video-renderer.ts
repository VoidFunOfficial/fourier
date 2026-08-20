import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
  compileVisualArtifact,
  type CompiledVisualArtifact,
  type CompileVisualArtifactOptions,
} from "./artifact-compiler.ts";
import { fail } from "./errors.ts";
import { SampleClock } from "./time.ts";
import { VisualTimelineRuntime } from "./visual-timeline-runtime.ts";
import type { ArtifactHostOptions } from "./integration-types.ts";

export interface RenderVisualArtifactVideoOptions {
  readonly output: string;
  readonly overwrite?: boolean;
  readonly ffmpegPath?: string;
  readonly crf?: number;
  readonly preset?: string;
  /** Maximum number of DOM Timeline pages used to sample dynamic artifact frames. */
  readonly domPages?: number;
  /** Opaque artifact pixels are unchanged; transparent pixels are composited over this color. */
  readonly background?: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: Readonly<{
    phase: "rendering" | "encoding";
    frame: number;
    totalFrames: number;
  }>) => void;
}

export interface RenderVisualArtifactVideoResult {
  readonly output: string;
  readonly snapshotId: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly totalFrames: number;
  readonly durationSeconds: number;
  readonly byteLength: number;
  readonly sha256: string;
}

function cancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) fail("RENDER_CANCELLED", "Artifact 视频渲染已取消");
}

function validateOptions(options: RenderVisualArtifactVideoOptions): void {
  if (extname(options.output).toLowerCase() !== ".mp4") {
    fail("UNSUPPORTED_OUTPUT", "Artifact 视频输出格式必须是 .mp4");
  }
  if (options.crf !== undefined &&
    (!Number.isInteger(options.crf) || options.crf < 0 || options.crf > 51)) {
    fail("INVALID_RENDER_OPTION", "crf 必须是 0—51 的整数");
  }
  if (options.preset !== undefined && options.preset.trim().length === 0) {
    fail("INVALID_RENDER_OPTION", "preset 必须是非空字符串");
  }
  if (
    options.domPages !== undefined &&
    (!Number.isInteger(options.domPages) || options.domPages <= 0)
  ) {
    fail("INVALID_RENDER_OPTION", "domPages 必须是正整数");
  }
  const background = options.background ?? "#101010";
  if (!/^#[0-9a-fA-F]{6}$/.test(background)) {
    fail("INVALID_RENDER_OPTION", "background 必须是 #RRGGBB 颜色");
  }
  cancelled(options.signal);
}

/**
 * Renders an ABI v1 artifact through the Render Engine's deterministic DOM
 * timeline and encodes the sampled frames as a browser-compatible H.264 MP4.
 */
export async function renderVisualArtifactVideo(
  input: CompiledVisualArtifact | CompileVisualArtifactOptions,
  options: RenderVisualArtifactVideoOptions,
  integration: ArtifactHostOptions,
): Promise<RenderVisualArtifactVideoResult> {
  validateOptions(options);
  const artifact = "sdkAbiVersion" in input
    ? input
    : await compileVisualArtifact(input, integration);
  const output = resolve(options.output);
  if (!options.overwrite && existsSync(output)) {
    fail("OUTPUT_EXISTS", `输出文件已存在: ${output}`);
  }

  await mkdir(dirname(output), { recursive: true });
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "fourier-artifact-video-"));
  const frameDirectory = join(temporaryDirectory, "frames");
  const temporaryOutput = join(
    dirname(output),
    `.${basename(output, ".mp4")}.${randomUUID()}.mp4`,
  );
  await mkdir(frameDirectory, { recursive: true });

  const maximumDomPages = Math.min(
    artifact.composition.durationInFrames,
    options.domPages ?? 1,
  );
  const runtime = new VisualTimelineRuntime({
    maximumDomPages,
    resolveAuthorImport: integration.resolveAuthorImport,
  });
  const instances: Array<Awaited<ReturnType<VisualTimelineRuntime["open"]>>> = [];
  let sourceFrameCount = artifact.composition.durationInFrames;
  let encodedFrameCount = sourceFrameCount;
  try {
    try {
      const first = await runtime.open(artifact);
      instances.push(first);
      if (first.isStatic) {
        sourceFrameCount = 1;
        encodedFrameCount = artifact.composition.fps;
      } else {
        const additional = await Promise.all(
          Array.from(
            { length: maximumDomPages - 1 },
            () => runtime.open(artifact),
          ),
        );
        instances.push(...additional);
      }
      const clock = new SampleClock(artifact.composition.fpsSource);
      let nextFrame = 0;
      let renderedFrames = 0;
      await Promise.all(instances.map(async (instance) => {
        while (true) {
          cancelled(options.signal);
          const frame = nextFrame;
          nextFrame += 1;
          if (frame >= sourceFrameCount) return;
          const sample = await instance.sample({
            time: clock.frameStart(frame),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
          });
          await Bun.write(
            join(frameDirectory, `frame-${String(frame).padStart(8, "0")}.png`),
            sample.png,
          );
          renderedFrames += 1;
          options.onProgress?.({
            phase: "rendering",
            frame: renderedFrames,
            totalFrames: sourceFrameCount,
          });
        }
      }));
    } finally {
      await Promise.allSettled(instances.map((instance) => instance.close()));
      await runtime.close().catch(() => undefined);
    }

    cancelled(options.signal);
    const width = artifact.composition.width + artifact.composition.width % 2;
    const height = artifact.composition.height + artifact.composition.height % 2;
    const background = (options.background ?? "#101010").replace("#", "0x");
    const inputArguments = sourceFrameCount === 1
      ? [
          "-loop", "1",
          "-framerate", artifact.composition.fpsSource,
          "-i", join(frameDirectory, "frame-00000000.png"),
          "-t", "1",
        ]
      : [
          "-framerate", artifact.composition.fpsSource,
          "-start_number", "0",
          "-i", join(frameDirectory, "frame-%08d.png"),
          "-frames:v", String(encodedFrameCount),
        ];
    const filter = [
      `color=c=${background}:s=${width}x${height}:r=${artifact.composition.fpsSource}[bg]`,
      "[0:v]format=rgba[fg]",
      "[bg][fg]overlay=0:0:shortest=1:format=auto,format=yuv420p[v]",
    ].join(";");
    options.onProgress?.({ phase: "encoding", frame: 0, totalFrames: encodedFrameCount });
    let process: ReturnType<typeof Bun.spawn>;
    try {
      process = Bun.spawn([
        options.ffmpegPath ?? "ffmpeg",
        "-hide_banner", "-loglevel", "error", "-y",
        ...inputArguments,
        "-filter_complex", filter,
        "-map", "[v]",
        "-an",
        "-c:v", "libx264",
        "-preset", options.preset ?? "medium",
        "-crf", String(options.crf ?? 24),
        "-movflags", "+faststart",
        temporaryOutput,
      ], {
        stdout: "ignore",
        stderr: "pipe",
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (error) {
      fail("ARTIFACT_VIDEO_ENCODE_FAILED", "无法启动 FFmpeg 编码 Artifact MP4", {
        ffmpegPath: options.ffmpegPath ?? "ffmpeg",
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    if (!(process.stderr instanceof ReadableStream)) {
      fail("INTERNAL_ERROR", "FFmpeg 错误输出管道不可读");
    }
    const [exitCode, stderr] = await Promise.all([
      process.exited,
      new Response(process.stderr).text(),
    ]);
    if (exitCode !== 0) {
      if (options.signal?.aborted) fail("RENDER_CANCELLED", "Artifact 视频渲染已取消");
      fail("ARTIFACT_VIDEO_ENCODE_FAILED", "FFmpeg 编码 Artifact MP4 失败", {
        exitCode,
        stderr: stderr.trim().slice(-12_000),
      });
    }
    if (!existsSync(temporaryOutput)) {
      fail("ARTIFACT_VIDEO_ENCODE_FAILED", "FFmpeg 成功退出但没有生成 Artifact MP4");
    }
    if (options.overwrite) await rm(output, { force: true });
    await rename(temporaryOutput, output);
    options.onProgress?.({
      phase: "encoding",
      frame: encodedFrameCount,
      totalFrames: encodedFrameCount,
    });
    const [bytes, information] = await Promise.all([readFile(output), stat(output)]);
    return Object.freeze({
      output,
      snapshotId: artifact.snapshotId,
      width: artifact.composition.width,
      height: artifact.composition.height,
      fps: artifact.composition.fps,
      totalFrames: encodedFrameCount,
      durationSeconds: encodedFrameCount / artifact.composition.fps,
      byteLength: information.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  } finally {
    await Promise.all([
      rm(temporaryDirectory, { recursive: true, force: true }),
      rm(temporaryOutput, { force: true }),
    ]);
  }
}
