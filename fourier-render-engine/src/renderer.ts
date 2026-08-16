import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { executeFfmpegPlan } from "./ffmpeg.ts";
import { fail } from "./errors.ts";
import {
  assertFfmpegTools,
  validateProjectMedia,
} from "./media-probe.ts";
import { loadProject } from "./project-compiler.ts";
import { prepareRenderModuleUnits } from "./render-module-renderer.ts";
import { emitDiagnostic, traceOperation } from "./render-diagnostics.ts";
import type {
  RenderOptions,
  RenderResult,
  ResolvedProject,
  TtsOptions,
} from "./types.ts";
import { prepareGeneratedVisuals } from "./visual-renderer.ts";
import {
  effectiveDomPageCount,
  VisualTimelineRuntime,
} from "./visual-timeline-runtime.ts";
import { writeRenderManifest } from "./render-manifest.ts";

function validateRenderOptions(options: RenderOptions): void {
  if (
    options.crf !== undefined &&
    (!Number.isFinite(options.crf) || options.crf < 0 || options.crf > 51)
  ) {
    fail("INVALID_RENDER_OPTION", "crf 必须在 0—51 之间");
  }
  if (
    options.frameConcurrency !== undefined &&
    (!Number.isInteger(options.frameConcurrency) ||
      options.frameConcurrency <= 0)
  ) {
    fail("INVALID_RENDER_OPTION", "frameConcurrency 必须是正整数");
  }
  if (
    options.domPages !== undefined &&
    (!Number.isInteger(options.domPages) || options.domPages <= 0)
  ) {
    fail("INVALID_RENDER_OPTION", "domPages 必须是正整数");
  }
  if (options.signal?.aborted) fail("RENDER_CANCELLED", "渲染已取消");
}

export async function validateProject(
  projectPath: string,
  options: {
    ffmpegPath?: string;
    ffprobePath?: string;
    validateMedia?: boolean;
    tts?: TtsOptions;
    signal?: AbortSignal;
  } = {},
): Promise<ResolvedProject> {
  const project = await loadProject(projectPath, {
    ...(options.tts === undefined ? {} : { tts: options.tts }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  if (options.validateMedia ?? true) {
    await assertFfmpegTools(options.ffmpegPath, options.ffprobePath);
    await validateProjectMedia(project, options.ffprobePath);
  }
  return project;
}

export async function renderProject(
  projectPath: string,
  options: RenderOptions,
): Promise<RenderResult> {
  validateRenderOptions(options);
  const startedAt = performance.now();
  options.onProgress?.({
    phase: "validating",
    progress: 0,
    totalFrames: 0,
    message: "正在编译并校验工程，并生成字幕音频",
  });
  const project = await traceOperation(
    options,
    {
      phase: "validating",
      scope: "project/load",
      message: "编译 Project JSX、求解时间线并准备 TTS",
      details: { projectPath },
    },
    () => loadProject(projectPath, {
      ...(options.tts === undefined ? {} : { tts: options.tts }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    }),
  );
  await traceOperation(
    options,
    {
      phase: "validating",
      scope: "tools/ffmpeg",
      message: "检查 FFmpeg 与 ffprobe",
      details: {
        ffmpeg: options.ffmpegPath ?? "ffmpeg",
        ffprobe: options.ffprobePath ?? "ffprobe",
      },
    },
    () => assertFfmpegTools(options.ffmpegPath, options.ffprobePath),
  );
  if (options.validateMedia ?? true) {
    await traceOperation(
      options,
      {
        phase: "validating",
        scope: "media/validate",
        message: "使用 ffprobe 校验媒体素材",
      },
      () => validateProjectMedia(project, options.ffprobePath),
    );
  }
  options.onProgress?.({
    phase: "validating",
    progress: 1,
    totalFrames: project.totalFrames,
    message: "工程校验通过",
  });
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "ai-video-render-engine-"),
  );
  emitDiagnostic(options, {
    phase: "preparing",
    scope: "render/config",
    status: "info",
    message: "渲染配置已解析",
    details: {
      projectId: project.metadata.id,
      totalFrames: project.totalFrames,
      scenes: project.sceneNodes.length,
      templates: project.templateNodes.length,
      frameConcurrency: options.frameConcurrency ?? "auto",
      domPages: options.domPages ?? "auto",
      temporaryDirectory,
      keepTemporaryFiles: options.keepTemporaryFiles ?? false,
    },
  });
  const timelineRuntime = new VisualTimelineRuntime({
    maximumDomPages: effectiveDomPageCount(options.domPages),
  });
  try {
    const prepareOptions = {
      temporaryDirectory,
      timelineRuntime,
      ...(options.ffmpegPath === undefined
        ? {}
        : { ffmpegPath: options.ffmpegPath }),
      ...(options.frameConcurrency === undefined
        ? {}
        : { frameConcurrency: options.frameConcurrency }),
      ...(options.domPages === undefined ? {} : { domPages: options.domPages }),
      ...(options.onProgress === undefined
        ? {}
        : { onProgress: options.onProgress }),
      ...(options.onDiagnostic === undefined
        ? {}
        : { onDiagnostic: options.onDiagnostic }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    };
    const renderModuleUnits = await traceOperation(
      options,
      {
        phase: "preparing",
        scope: "modules/all",
        message: "准备 Scene 与 Template 渲染单元",
      },
      () => prepareRenderModuleUnits(project, prepareOptions),
    );
    const prepared = await traceOperation(
      options,
      {
        phase: "preparing",
        scope: "visuals/root",
        message: "准备主工程生成式视觉节点",
      },
      () => prepareGeneratedVisuals(project, prepareOptions),
    );
    if (options.signal?.aborted) fail("RENDER_CANCELLED", "渲染已取消");
    const output = await executeFfmpegPlan(
      project,
      prepared,
      resolve(options.output),
      temporaryDirectory,
      options,
      renderModuleUnits,
    );
    const artifacts = [...prepared.values()].flatMap(
      (visual) => visual.timelineArtifacts ?? [],
    );
    const { manifestPath } = await writeRenderManifest({
      output,
      projectId: project.metadata.id,
      totalFrames: project.totalFrames,
      fps: project.canvas.fps,
      artifacts,
    });
    const result: RenderResult = {
      output,
      manifestPath,
      projectId: project.metadata.id,
      totalFrames: project.totalFrames,
      durationSeconds: project.totalFrames / project.canvas.fps,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
    options.onProgress?.({
      phase: "completed",
      progress: 1,
      frame: project.totalFrames,
      totalFrames: project.totalFrames,
      message: "渲染完成",
    });
    return result;
  } finally {
    await traceOperation(
      options,
      {
        phase: "cleanup",
        scope: "visuals/runtime",
        message: "关闭整次渲染共享的 DOM Timeline 运行时与 keepAlive page",
      },
      () => timelineRuntime.close(),
    ).catch(() => {});
    if (!options.keepTemporaryFiles) {
      await traceOperation(
        options,
        {
          phase: "cleanup",
          scope: "temporary-files",
          message: "清理渲染临时目录",
          details: { temporaryDirectory },
        },
        () => rm(temporaryDirectory, { recursive: true, force: true }),
      ).catch(() => {});
    } else {
      emitDiagnostic(options, {
        phase: "cleanup",
        scope: "temporary-files",
        status: "info",
        message: "已按 --keep-temp 保留渲染临时目录",
        details: { temporaryDirectory },
      });
    }
  }
}
