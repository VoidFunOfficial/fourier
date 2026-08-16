import { fail } from "./errors.ts";
import { framesToSeconds } from "./time.ts";
import type {
  AudioNode,
  MediaProbe,
  ResolvedProject,
  TextNode,
  VideoNode,
} from "./types.ts";

type VoicedTextNode = TextNode & { voice: NonNullable<TextNode["voice"]> };

async function runCaptured(
  executable: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let process: ReturnType<typeof Bun.spawn>;
  try {
    process = Bun.spawn([executable, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    fail(
      "TOOL_NOT_FOUND",
      `无法启动 ${executable}: ${error instanceof Error ? error.message : String(error)}`,
      { executable },
    );
  }
  if (
    !(process.stdout instanceof ReadableStream) ||
    !(process.stderr instanceof ReadableStream)
  ) {
    fail("INTERNAL_ERROR", `${executable} 的输出管道不可读`);
  }
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

export async function assertFfmpegTools(
  ffmpegPath = "ffmpeg",
  ffprobePath = "ffprobe",
): Promise<void> {
  const [ffmpeg, ffprobe, filters] = await Promise.all([
    runCaptured(ffmpegPath, ["-version"]),
    runCaptured(ffprobePath, ["-version"]),
    runCaptured(ffmpegPath, ["-hide_banner", "-filters"]),
  ]);
  if (ffmpeg.exitCode !== 0) {
    fail("TOOL_NOT_FOUND", `${ffmpegPath} 不可用`, {
      stderr: ffmpeg.stderr.trim(),
    });
  }
  if (ffprobe.exitCode !== 0) {
    fail("TOOL_NOT_FOUND", `${ffprobePath} 不可用`, {
      stderr: ffprobe.stderr.trim(),
    });
  }
  const availableFilters = `${filters.stdout}\n${filters.stderr}`;
  const missingFilters = [
    "perspective",
    "overlay",
    "geq",
    "alphaextract",
    "alphamerge",
    "blend",
  ].filter(
    (name) => !new RegExp(`\\b${name}\\b`).test(availableFilters),
  );
  if (filters.exitCode !== 0 || missingFilters.length > 0) {
    fail(
      "FFMPEG_FILTER_UNAVAILABLE",
      `${ffmpegPath} 缺少必需 filter: ${missingFilters.join(", ")}`,
      { missingFilters, stderr: filters.stderr.trim() },
    );
  }
}

export async function probeMedia(
  path: string,
  ffprobePath = "ffprobe",
): Promise<MediaProbe> {
  const result = await runCaptured(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type,duration,sample_rate",
    "-of",
    "json",
    path,
  ]);
  if (result.exitCode !== 0) {
    fail("MEDIA_PROBE_FAILED", `无法读取素材信息: ${path}`, {
      path,
      stderr: result.stderr.trim(),
    });
  }
  try {
    const parsed = JSON.parse(result.stdout) as Partial<MediaProbe>;
    return {
      format: parsed.format ?? {},
      streams: Array.isArray(parsed.streams) ? parsed.streams : [],
    };
  } catch {
    fail("MEDIA_PROBE_FAILED", `ffprobe 返回了无效 JSON: ${path}`);
  }
}

function durationOf(
  probe: MediaProbe,
  streamType: "video" | "audio",
): number | undefined {
  const streamDurations = probe.streams
    .filter((stream) => stream.codec_type === streamType)
    .map((stream) => Number(stream.duration))
    .filter((duration) => Number.isFinite(duration) && duration >= 0);
  if (streamDurations.length > 0) return Math.max(...streamDurations);
  const formatDuration = Number(probe.format.duration);
  return Number.isFinite(formatDuration) && formatDuration >= 0
    ? formatDuration
    : undefined;
}

function validateCoverage(
  node: AudioNode | VideoNode,
  sourceDuration: number | undefined,
  project: ResolvedProject,
  streamType: "video" | "audio",
): void {
  if (sourceDuration === undefined) {
    fail(
      "UNKNOWN_MEDIA_DURATION",
      `素材 "${node.src}" 无法确定 ${streamType} 时长`,
      { node: node.id, source: node.src, streamType },
    );
  }
  const inputStart = framesToSeconds(node.inFrame, project.canvas.fps);
  const required =
    inputStart +
    framesToSeconds(node.durationFrames, project.canvas.fps) * node.rate;
  const tolerance = Math.max(0.002, 1 / project.canvas.fps);
  if (required - sourceDuration > tolerance) {
    fail(
      "MEDIA_TOO_SHORT",
      `素材 "${node.src}" 无法覆盖节点 "${node.id}" 的读取区间`,
      {
        node: node.id,
        source: node.src,
        streamType,
        sourceDuration,
        requiredSourceEnd: required,
      },
    );
  }
}

function validateLoopStart(
  node: VideoNode,
  sourceDuration: number | undefined,
  project: ResolvedProject,
): void {
  if (sourceDuration === undefined || sourceDuration <= 0) {
    fail(
      "UNKNOWN_MEDIA_DURATION",
      `循环素材 "${node.src}" 无法确定有效视频时长`,
      { node: node.id, source: node.src },
    );
  }
  const inputStart = framesToSeconds(node.inFrame, project.canvas.fps);
  if (inputStart >= sourceDuration) {
    fail(
      "INVALID_MEDIA_IN_POINT",
      `循环素材 "${node.src}" 的 in 必须位于原始视频时长内`,
      {
        node: node.id,
        source: node.src,
        sourceDuration,
        inputStart,
      },
    );
  }
}

export async function validateProjectMedia(
  project: ResolvedProject,
  ffprobePath = "ffprobe",
): Promise<Map<string, MediaProbe>> {
  const mediaNodes = project.nodes.filter(
    (node): node is AudioNode | VideoNode =>
      node.enabled && (node.kind === "audio" || node.kind === "video"),
  );
  const voicedTextNodes = project.nodes.filter(
    (node): node is VoicedTextNode =>
      (node.kind === "text" || node.kind === "subtitle") &&
      node.enabled &&
      node.voice !== undefined,
  );
  const paths = [
    ...new Set([
      ...mediaNodes.map((node) => node.sourcePath),
      ...voicedTextNodes.map((node) => node.voice.sourcePath),
    ]),
  ];
  const probes = new Map<string, MediaProbe>();
  await Promise.all(
    paths.map(async (path) => {
      probes.set(path, await probeMedia(path, ffprobePath));
    }),
  );

  for (const node of mediaNodes) {
    const probe = probes.get(node.sourcePath);
    if (probe === undefined) {
      fail("MEDIA_PROBE_FAILED", `缺少素材探测结果: ${node.src}`);
    }
    if (node.kind === "audio") {
      if (!probe.streams.some((stream) => stream.codec_type === "audio")) {
        fail("MISSING_AUDIO_STREAM", `素材 "${node.src}" 不包含音频流`, {
          node: node.id,
        });
      }
      validateCoverage(
        node,
        durationOf(probe, "audio"),
        project,
        "audio",
      );
    } else {
      if (!probe.streams.some((stream) => stream.codec_type === "video")) {
        fail("MISSING_VIDEO_STREAM", `素材 "${node.src}" 不包含视频流`, {
          node: node.id,
        });
      }
      if (!node.loop) {
        validateCoverage(
          node,
          durationOf(probe, "video"),
          project,
          "video",
        );
      } else {
        validateLoopStart(node, durationOf(probe, "video"), project);
      }
      if (node.audio) {
        if (!probe.streams.some((stream) => stream.codec_type === "audio")) {
          fail(
            "MISSING_AUDIO_STREAM",
            `video "${node.id}" 声明 audio="on"，但素材不包含音频流`,
            { node: node.id, source: node.src },
          );
        }
        if (!node.loop) {
          validateCoverage(
            node,
            durationOf(probe, "audio"),
            project,
            "audio",
          );
        }
      }
    }
  }
  for (const node of voicedTextNodes) {
    const probe = probes.get(node.voice.sourcePath);
    if (probe === undefined) {
      fail(
        "MEDIA_PROBE_FAILED",
        `缺少字幕 "${node.id}" 的 TTS 音频探测结果`,
      );
    }
    if (!probe.streams.some((stream) => stream.codec_type === "audio")) {
      fail(
        "MISSING_AUDIO_STREAM",
        `字幕 "${node.id}" 的 TTS 结果不包含音频流`,
        { node: node.id, source: node.voice.sourcePath },
      );
    }
    const sourceDuration = durationOf(probe, "audio");
    if (sourceDuration === undefined) {
      fail(
        "UNKNOWN_MEDIA_DURATION",
        `字幕 "${node.id}" 的 TTS 音频无法确定时长`,
        { node: node.id, source: node.voice.sourcePath },
      );
    }
    const tolerance = Math.max(0.002, 1 / project.canvas.fps);
    if (node.voice.durationSeconds - sourceDuration > tolerance) {
      fail(
        "MEDIA_TOO_SHORT",
        `字幕 "${node.id}" 的 TTS 音频短于合成元数据`,
        {
          node: node.id,
          sourceDuration,
          expectedDuration: node.voice.durationSeconds,
        },
      );
    }
  }
  const visitedScenes = new Set<string>();
  for (const scene of project.sceneNodes) {
    if (visitedScenes.has(scene.sourcePath)) continue;
    visitedScenes.add(scene.sourcePath);
    const nested = await validateProjectMedia(scene.project, ffprobePath);
    for (const [path, probe] of nested) probes.set(path, probe);
  }
  const visitedTemplates = new Set<string>();
  for (const template of project.templateNodes) {
    const key = `${template.sourcePath}\0${JSON.stringify(template.bindings)}`;
    if (visitedTemplates.has(key)) continue;
    visitedTemplates.add(key);
    const nested = await validateProjectMedia(template.project, ffprobePath);
    for (const [path, probe] of nested) probes.set(path, probe);
  }
  return probes;
}
