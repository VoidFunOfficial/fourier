import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fail } from "./errors.ts";
import { emitDiagnostic, traceOperation } from "./render-diagnostics.ts";
import { evaluateVisualPlacement } from "./modifiers.ts";
import {
  framesToFfmpegSeconds,
  framesToSamples,
} from "./time.ts";
import type {
  AudioNode,
  FitMode,
  ReactNode,
  RenderNode,
  RenderModuleNode,
  RenderModuleUnit,
  RenderOptions,
  ResolvedProject,
  TextNode,
  VideoNode,
  VisualNode,
} from "./types.ts";
import type { PreparedVisual } from "./visual-renderer.ts";

type VoicedTextNode = TextNode & { voice: NonNullable<TextNode["voice"]> };

interface InputBinding {
  node: RenderNode;
  inputIndex: number;
  audioInputIndex?: number;
  decorationInputIndex?: number;
  maskInputIndex?: number;
  preparedVisual?: PreparedVisual;
}

export interface FfmpegPlan {
  args: string[];
  filterGraph: string;
  temporaryOutput: string;
}

export type FfmpegOutputProfile = "final" | "module";

interface RenderModuleInputBinding {
  node: RenderModuleNode;
  inputIndex: number;
  unit: RenderModuleUnit;
}

function decimal(value: number): string {
  if (!Number.isFinite(value)) fail("INVALID_NUMBER", "FFmpeg 数值不是有限数");
  return Number(value.toFixed(12)).toString();
}

function frameExpression(
  values: number[],
  frameVariable = "n",
  frameOffset = 0,
): string {
  if (values.length === 0) return "0";
  if (values.every((value) => Math.abs(value - (values[0] ?? 0)) < 1e-12)) {
    return decimal(values[0] ?? 0);
  }
  const build = (start: number, end: number): string => {
    if (start === end) return decimal(values[start] ?? 0);
    const middle = Math.floor((start + end) / 2);
    return (
      `if(lte(${frameVariable},${middle + frameOffset}),` +
      `${build(start, middle)},${build(middle + 1, end)})`
    );
  };
  return build(0, values.length - 1);
}

function ffmpegColor(color: string): string {
  return color.startsWith("#") ? `0x${color.slice(1)}` : color;
}

function isVisualNode(
  node: RenderNode,
): node is VideoNode | TextNode | ReactNode | (RenderNode & VisualNode) {
  return node.kind !== "audio";
}

function isVoicedTextNode(node: RenderNode): node is VoicedTextNode {
  return (
    (node.kind === "text" || node.kind === "subtitle") &&
    node.voice !== undefined
  );
}

function fitFilter(mode: FitMode, width: number, height: number): string[] {
  if (mode === "stretch") return [`scale=${width}:${height}`];
  if (mode === "cover") {
    return [
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`,
    ];
  }
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
  ];
}

function atempoFilters(rate: number): string[] {
  const factors: number[] = [];
  let remaining = rate;
  while (remaining > 100) {
    factors.push(100);
    remaining /= 100;
  }
  while (remaining < 0.5) {
    factors.push(0.5);
    remaining /= 0.5;
  }
  if (Math.abs(remaining - 1) > 1e-9 || factors.length === 0) {
    factors.push(remaining);
  }
  return factors.map((factor) => `atempo=${decimal(factor)}`);
}

function videoTimingFilters(project: ResolvedProject, node: VideoNode): string[] {
  const sourceStart = node.inFrame / project.canvas.fps;
  const sourceDuration = (node.durationFrames / project.canvas.fps) * node.rate;
  return [
    `trim=start=${decimal(sourceStart)}:duration=${decimal(sourceDuration)}`,
    `setpts=(PTS-STARTPTS)/${decimal(node.rate)}`,
    `fps=${project.canvas.fpsSource}`,
    `trim=end_frame=${node.durationFrames}`,
    "setpts=PTS-STARTPTS",
    "format=rgba",
    ...fitFilter(node.fit, node.width, node.height),
  ];
}

function roundedAlpha(radius: number, width: number, height: number): string {
  if (radius <= 0) return "alpha(X,Y)";
  const r = decimal(radius);
  const right = decimal(width - radius - 1);
  const bottom = decimal(height - radius - 1);
  const nearestX = `if(lt(X,${r}),${r},${right})`;
  const nearestY = `if(lt(Y,${r}),${r},${bottom})`;
  const inside = `if(between(X,${r},${right}),1,` +
    `if(between(Y,${r},${bottom}),1,` +
    `lte(pow(X-(${nearestX}),2)+pow(Y-(${nearestY}),2),pow(${r},2))))`;
  return `alpha(X,Y)*(${inside})`;
}

function visualFilters(
  project: ResolvedProject,
  node: Exclude<RenderNode, AudioNode>,
  inputIndex: number,
  preparedVisual?: PreparedVisual,
  decorationInputIndex?: number,
  maskInputIndex?: number,
): string[] {
  const lines: string[] = [];
  const filters: string[] = [];
  let inputLabel = `[${inputIndex}:v]`;
  const placements = Array.from(
    { length: node.durationFrames },
    (_, frame) => evaluateVisualPlacement(node, frame),
  );
  if (preparedVisual?.ffmpegVideo !== undefined) {
    if (
      node.kind !== "video" ||
      decorationInputIndex === undefined ||
      maskInputIndex === undefined
    ) {
      fail("INTERNAL_ERROR", `节点 "${node.id}" 的 FFmpeg Video 输入绑定不完整`);
    }
    const projections = preparedVisual.ffmpegVideo.projections;
    if (projections.length !== node.durationFrames) {
      fail("VIDEO_SURFACE_REQUIRED", `节点 "${node.id}" 的投影帧数量不匹配`);
    }
    const radii = projections.map((surface) => surface.cornerRadiusRatio);
    if (radii.some((value) => Math.abs(value - (radii[0] ?? 0)) > 1e-9)) {
      fail("VIDEO_SURFACE_INVALID", `节点 "${node.id}" 的圆角比例不能逐帧变化`);
    }
    const coordinate = (corner: 0 | 1 | 2 | 3, axis: "x" | "y") =>
      frameExpression(
        projections.map((surface) => surface.corners[corner][axis]),
        "on",
      );
    const radius = (radii[0] ?? 0) * Math.min(node.width, node.height);
    lines.push(
      `[${inputIndex}:v]${videoTimingFilters(project, node).join(",")},` +
        `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${roundedAlpha(radius, node.width, node.height)}'` +
        `[video_source_${node.declarationOrder}]`,
      `[video_source_${node.declarationOrder}]perspective=` +
        `x0='${coordinate(0, "x")}':y0='${coordinate(0, "y")}':` +
        `x1='${coordinate(1, "x")}':y1='${coordinate(1, "y")}':` +
        `x2='${coordinate(2, "x")}':y2='${coordinate(2, "y")}':` +
        `x3='${coordinate(3, "x")}':y3='${coordinate(3, "y")}':` +
        `interpolation=cubic:sense=destination:eval=frame` +
        `[video_warped_${node.declarationOrder}]`,
      `[video_warped_${node.declarationOrder}]split=2` +
        `[video_color_source_${node.declarationOrder}]` +
        `[video_alpha_source_${node.declarationOrder}]`,
      `[video_color_source_${node.declarationOrder}]format=rgb24` +
        `[video_color_${node.declarationOrder}]`,
      `[video_alpha_source_${node.declarationOrder}]alphaextract` +
        `[video_alpha_${node.declarationOrder}]`,
      `[${maskInputIndex}:v]trim=end_frame=${node.durationFrames},` +
        `setpts=PTS-STARTPTS,fps=${project.canvas.fpsSource},format=gray,` +
        `scale=${preparedVisual.width}:${preparedVisual.height}` +
        `[video_quad_mask_${node.declarationOrder}]`,
      `[video_alpha_${node.declarationOrder}]` +
        `[video_quad_mask_${node.declarationOrder}]` +
        `blend=all_mode=multiply[video_clipped_alpha_${node.declarationOrder}]`,
      `[video_color_${node.declarationOrder}]` +
        `[video_clipped_alpha_${node.declarationOrder}]alphamerge` +
        `[video_surface_${node.declarationOrder}]`,
      `[${decorationInputIndex}:v]trim=end_frame=${node.durationFrames},` +
        `setpts=PTS-STARTPTS,fps=${project.canvas.fpsSource},format=rgba,` +
        `scale=${preparedVisual.width}:${preparedVisual.height}` +
        `[video_panel_${node.declarationOrder}]`,
      `[video_panel_${node.declarationOrder}][video_surface_${node.declarationOrder}]` +
        `overlay=x=0:y=0:eof_action=pass:repeatlast=0:shortest=0` +
        `[video_panel_composite_${node.declarationOrder}]`,
    );
    inputLabel = `[video_panel_composite_${node.declarationOrder}]`;
  } else if (preparedVisual !== undefined) {
    filters.push(
      `trim=end_frame=${node.durationFrames}`,
      "setpts=PTS-STARTPTS",
      `fps=${project.canvas.fpsSource}`,
      "format=rgba",
      `scale=${preparedVisual.width}:${preparedVisual.height}`,
    );
  } else if (node.kind === "video") {
    filters.push(...videoTimingFilters(project, node));
  } else if (node.kind === "image") {
    filters.push(
      `trim=end_frame=${node.durationFrames}`,
      "setpts=PTS-STARTPTS",
      `fps=${project.canvas.fpsSource}`,
      "format=rgba",
      ...fitFilter(node.fit, node.width, node.height),
    );
  } else {
    filters.push(
      `trim=end_frame=${node.durationFrames}`,
      "setpts=PTS-STARTPTS",
      `fps=${project.canvas.fpsSource}`,
      "format=rgba",
      `scale=${node.width}:${node.height}`,
    );
  }
  const opacity = frameExpression(
    placements.map((placement) =>
      placement.scaleX === 0 || placement.scaleY === 0
        ? 0
        : placement.opacity
    ),
    "N",
  );
  if (opacity !== "1") {
    filters.push(
      `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${opacity})'`,
    );
  }
  const scaleX = frameExpression(
    placements.map((placement) => placement.scaleX),
  );
  const scaleY = frameExpression(
    placements.map((placement) => placement.scaleY),
  );
  if (scaleX !== "1" || scaleY !== "1") {
    filters.push(
      `scale=w='max(1,iw*(${scaleX}))':h='max(1,ih*(${scaleY}))':eval=frame`,
    );
  }
  const rotation = frameExpression(
    placements.map((placement) => (placement.rotation * Math.PI) / 180),
  );
  if (rotation !== "0") {
    filters.push(
      `rotate='${rotation}':ow=rotw(iw):oh=roth(ih):c=black@0`,
    );
  }
  filters.push(
    `setpts=PTS+${node.startFrame}/${project.canvas.fpsSource}/TB`,
  );
  lines.push(
    `${inputLabel}${filters.join(",")}[visual_${node.declarationOrder}]`,
  );
  return lines;
}

function audioFilters(
  project: ResolvedProject,
  node: AudioNode | VideoNode | VoicedTextNode,
  inputIndex: number,
): string {
  const isVoice = isVoicedTextNode(node);
  const sourceStart = isVoice ? 0 : node.inFrame / project.canvas.fps;
  const rate = isVoice ? 1 : node.rate;
  const sourceDuration = isVoice
    ? node.voice.durationSeconds
    : (node.durationFrames / project.canvas.fps) * rate;
  const outputDuration = node.durationFrames / project.canvas.fps;
  const delaySamples = framesToSamples(
    node.startFrame,
    project.metadata.audioSampleRate,
    project.canvas.fpsSource,
  );
  const volume = isVoice
    ? node.voice.volume
    : node.kind === "audio" && node.muted
      ? 0
      : node.volume;
  const filters = [
    `atrim=start=${decimal(sourceStart)}:duration=${decimal(sourceDuration)}`,
    "asetpts=PTS-STARTPTS",
    ...atempoFilters(rate),
    `atrim=end=${decimal(outputDuration)}`,
    `volume=${decimal(volume)}`,
    `aresample=${project.metadata.audioSampleRate}`,
    `adelay=delays=${delaySamples}S:all=1`,
  ];
  return `[${inputIndex}:a]${filters.join(",")}[audio_${node.declarationOrder}]`;
}

function renderModuleVisualFilters(
  project: ResolvedProject,
  binding: RenderModuleInputBinding,
): string[] {
  const node = binding.node;
  const visual = `scene_visual_${node.declarationOrder}`;
  const canvas = `scene_canvas_${node.declarationOrder}`;
  const full = `scene_full_${node.declarationOrder}`;
  return [
    `[${binding.inputIndex}:v]trim=end_frame=${node.durationFrames},` +
      `setpts=PTS-STARTPTS,fps=${project.canvas.fpsSource},format=rgba,` +
      `colorchannelmixer=aa=${decimal(node.opacity)},` +
      `setpts=PTS+${node.startFrame}/${project.canvas.fpsSource}/TB[${visual}]`,
    `color=c=black@0:s=${project.canvas.width}x${project.canvas.height}:` +
      `r=${project.canvas.fpsSource}:d=${decimal(project.totalFrames / project.canvas.fps)},` +
      `format=rgba[${canvas}]`,
    `[${canvas}][${visual}]overlay=x=0:y=0:eof_action=pass:repeatlast=0:` +
      `shortest=0:enable='between(n,${node.startFrame},${node.endFrame - 1})'[${full}]`,
  ];
}

function renderModuleAudioFilters(
  project: ResolvedProject,
  binding: RenderModuleInputBinding,
): string {
  const node = binding.node;
  const outputDuration = node.durationFrames / project.canvas.fps;
  const delaySamples = framesToSamples(
    node.startFrame,
    project.metadata.audioSampleRate,
    project.canvas.fpsSource,
  );
  return `[${binding.inputIndex}:a]atrim=end=${decimal(outputDuration)},` +
    `asetpts=PTS-STARTPTS,volume=${decimal(node.volume)},` +
    `aresample=${project.metadata.audioSampleRate},` +
    `adelay=delays=${delaySamples}S:all=1[scene_audio_${node.declarationOrder}]`;
}

function createTemporaryOutput(output: string): string {
  const extension = extname(output) || ".mp4";
  const stem = basename(output, extname(output));
  return join(
    dirname(output),
    `.${stem}.${crypto.randomUUID()}.rendering${extension}`,
  );
}

export function buildFfmpegPlan(
  project: ResolvedProject,
  prepared: Map<string, PreparedVisual>,
  output: string,
  options: RenderOptions,
  sceneUnits: ReadonlyMap<string, RenderModuleUnit> = new Map(),
  profile: FfmpegOutputProfile = "final",
): FfmpegPlan {
  const args: string[] = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-y",
    "-f",
    "lavfi",
    "-i",
    profile === "module"
      ? `color=c=black@0:s=${project.canvas.width}x${project.canvas.height}:r=${project.canvas.fpsSource},format=rgba`
      : `color=c=${ffmpegColor(project.canvas.background)}:s=${project.canvas.width}x${project.canvas.height}:r=${project.canvas.fpsSource}`,
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=${project.metadata.audioSampleRate}:cl=stereo`,
  ];
  const bindings: InputBinding[] = [];
  const renderModuleBindings: RenderModuleInputBinding[] = [];
  let inputIndex = 2;

  const enabledNodes = project.nodes.filter((node) => node.enabled);
  for (const node of enabledNodes) {
    const generated = prepared.get(node.id);
    if (node.kind === "audio") {
      args.push("-i", node.sourcePath);
      bindings.push({
        node,
        inputIndex,
        audioInputIndex: inputIndex,
      });
      inputIndex++;
      continue;
    }
    if (generated !== undefined) {
      if (generated.ffmpegVideo !== undefined) {
        if (node.kind !== "video") {
          fail(
            "FFMPEG_VIDEO_MOTION_HOST_REQUIRED",
            `FFmpeg Video prepared visual 只能属于 video，收到 ${node.kind}`,
          );
        }
        if (node.loop) args.push("-stream_loop", "-1");
        args.push("-i", node.sourcePath);
        const videoInputIndex = inputIndex++;
        if (generated.type === "media") {
          args.push("-i", generated.path);
        } else {
          args.push(
            "-framerate",
            project.canvas.fpsSource,
            "-start_number",
            "0",
            "-i",
            generated.path,
          );
        }
        const decorationInputIndex = inputIndex++;
        if (generated.type === "media") {
          args.push("-i", generated.ffmpegVideo.maskPath);
        } else {
          args.push(
            "-framerate",
            project.canvas.fpsSource,
            "-start_number",
            "0",
            "-i",
            generated.ffmpegVideo.maskPath,
          );
        }
        const maskInputIndex = inputIndex++;
        bindings.push({
          node,
          inputIndex: videoInputIndex,
          decorationInputIndex,
          maskInputIndex,
          ...(node.audio ? { audioInputIndex: videoInputIndex } : {}),
          preparedVisual: generated,
        });
        continue;
      }
      if (generated.type === "static") {
        args.push(
          "-loop",
          "1",
          "-framerate",
          project.canvas.fpsSource,
          "-i",
          generated.path,
        );
      } else if (generated.type === "sequence") {
        args.push(
          "-framerate",
          project.canvas.fpsSource,
          "-start_number",
          "0",
          "-i",
          generated.path,
        );
      } else {
        args.push("-i", generated.path);
      }
      const visualInputIndex = inputIndex++;
      if (isVoicedTextNode(node)) {
        args.push("-i", node.voice.sourcePath);
        bindings.push({
          node,
          inputIndex: visualInputIndex,
          audioInputIndex: inputIndex++,
          preparedVisual: generated,
        });
      } else if (node.kind === "video" && node.audio) {
        if (node.loop) args.push("-stream_loop", "-1");
        args.push("-i", node.sourcePath);
        bindings.push({
          node,
          inputIndex: visualInputIndex,
          audioInputIndex: inputIndex++,
          preparedVisual: generated,
        });
      } else {
        bindings.push({
          node,
          inputIndex: visualInputIndex,
          preparedVisual: generated,
        });
      }
      continue;
    }
    if (node.kind === "video") {
      if (node.loop) args.push("-stream_loop", "-1");
      args.push("-i", node.sourcePath);
    } else if (node.kind === "image") {
      args.push(
        "-loop",
        "1",
        "-framerate",
        project.canvas.fpsSource,
        "-i",
        node.sourcePath,
      );
    } else {
      fail(
        "MISSING_GENERATED_VISUAL",
        `节点 "${node.id}" 缺少预生成画面`,
      );
    }
    bindings.push({
      node,
      inputIndex,
      ...(node.kind === "video" && node.audio
        ? { audioInputIndex: inputIndex }
        : {}),
    });
    inputIndex++;
  }

  for (const node of [...project.sceneNodes, ...project.templateNodes]) {
    const unit = sceneUnits.get(node.id);
    if (unit === undefined) {
      fail("MISSING_RENDER_MODULE_UNIT", `${node.kind} "${node.id}" 缺少 Render Unit`, {
        node: node.id,
      });
    }
    args.push("-i", unit.path);
    renderModuleBindings.push({ node, inputIndex, unit });
    inputIndex++;
  }

  const filterLines: string[] = [
    `[0:v]trim=end_frame=${project.totalFrames},setpts=PTS-STARTPTS,format=rgba[canvas]`,
  ];
  const visualBindings = bindings
    .filter(
      (
        binding,
      ): binding is InputBinding & {
        node: Exclude<RenderNode, AudioNode>;
      } => isVisualNode(binding.node),
    );

  for (const binding of visualBindings) {
    filterLines.push(
      ...visualFilters(
        project,
        binding.node,
        binding.inputIndex,
        binding.preparedVisual,
        binding.decorationInputIndex,
        binding.maskInputIndex,
      ),
    );
  }
  for (const binding of renderModuleBindings) {
    filterLines.push(...renderModuleVisualFilters(project, binding));
  }

  const compositeBindings: Array<
    | { kind: "node"; binding: (typeof visualBindings)[number] }
    | { kind: "module"; binding: RenderModuleInputBinding }
  > = [
    ...visualBindings.map((binding) => ({ kind: "node" as const, binding })),
    ...renderModuleBindings.map((binding) => ({ kind: "module" as const, binding })),
  ].sort((left, right) => {
    const leftNode = left.binding.node;
    const rightNode = right.binding.node;
    return leftNode.layer - rightNode.layer ||
      leftNode.declarationOrder - rightNode.declarationOrder;
  });

  let composite = "canvas";
  for (let index = 0; index < compositeBindings.length; index++) {
    const entry = compositeBindings[index];
    if (entry === undefined) continue;
    const next = `composite_${index}`;
    if (entry.kind === "module") {
      const node = entry.binding.node;
      const sceneLabel = `scene_full_${node.declarationOrder}`;
      if (node.blend === "normal") {
        filterLines.push(
          `[${composite}][${sceneLabel}]overlay=x=0:y=0:` +
            `eof_action=pass:repeatlast=0:shortest=0[${next}]`,
        );
      } else {
        const baseKeep = `scene_base_keep_${index}`;
        const baseBlend = `scene_base_blend_${index}`;
        const topBlend = `scene_top_blend_${index}`;
        const topMask = `scene_top_mask_${index}`;
        const blended = `scene_blended_${index}`;
        const mask = `scene_mask_${index}`;
        filterLines.push(
          `[${composite}]split=2[${baseKeep}][${baseBlend}]`,
          `[${sceneLabel}]split=2[${topBlend}][${topMask}]`,
          `[${baseBlend}][${topBlend}]blend=all_mode=${node.blend}[${blended}]`,
          `[${topMask}]alphaextract[${mask}]`,
          `[${baseKeep}][${blended}][${mask}]maskedmerge[${next}]`,
        );
      }
      composite = next;
      continue;
    }
    const binding = entry.binding;
    const node = binding.node;
    const x = frameExpression(
      Array.from(
        { length: node.durationFrames },
        (_, frame) => evaluateVisualPlacement(node, frame).x,
      ),
      "n",
      node.startFrame + 1,
    );
    const y = frameExpression(
      Array.from(
        { length: node.durationFrames },
        (_, frame) => evaluateVisualPlacement(node, frame).y,
      ),
      "n",
      node.startFrame + 1,
    );
    filterLines.push(
      `[${composite}][visual_${node.declarationOrder}]overlay=` +
        `x='(${x})-overlay_w/2':` +
        `y='(${y})-overlay_h/2':` +
        "eof_action=pass:repeatlast=0:shortest=0:" +
        `enable='between(n,${node.startFrame},${node.endFrame - 1})'[${next}]`,
    );
    composite = next;
  }
  filterLines.push(
    `[${composite}]format=${profile === "module" ? "argb" : "yuv444p"}[vout]`,
  );

  const audioBindings = bindings.filter(
    (
      binding,
    ): binding is InputBinding & {
      node: AudioNode | VideoNode | VoicedTextNode;
    } =>
      binding.node.kind === "audio" ||
      (binding.node.kind === "video" && binding.node.audio) ||
      isVoicedTextNode(binding.node),
  );
  const totalSeconds = project.totalFrames / project.canvas.fps;
  filterLines.push(
    `[1:a]atrim=end=${decimal(totalSeconds)},asetpts=PTS-STARTPTS,aresample=${project.metadata.audioSampleRate}[silence]`,
  );
  for (const binding of audioBindings) {
    filterLines.push(
      audioFilters(
        project,
        binding.node,
        binding.audioInputIndex ?? binding.inputIndex,
      ),
    );
  }
  const enabledModuleAudio = renderModuleBindings.filter(
    (binding) => binding.node.audio,
  );
  for (const binding of enabledModuleAudio) {
    filterLines.push(renderModuleAudioFilters(project, binding));
  }
  const audioLabels = [
    "[silence]",
    ...audioBindings.map(
      (binding) => `[audio_${binding.node.declarationOrder}]`,
    ),
    ...enabledModuleAudio.map(
      (binding) => `[scene_audio_${binding.node.declarationOrder}]`,
    ),
  ].join("");
  const mixedAudioCount = audioBindings.length + enabledModuleAudio.length + 1;
  filterLines.push(
    `${audioLabels}amix=inputs=${mixedAudioCount}:duration=longest:` +
      `dropout_transition=0:normalize=0,atrim=end=${decimal(totalSeconds)},` +
      `asetpts=N/SR/TB[aout]`,
  );

  const temporaryOutput = createTemporaryOutput(output);
  const evenCanvas = project.canvas.width % 2 === 0 &&
    project.canvas.height % 2 === 0;
  args.push(
    "-filter_complex_script",
    "__FILTER_SCRIPT__",
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-frames:v",
    String(project.totalFrames),
  );
  if (profile === "module") {
    args.push(
      "-c:v",
      "qtrle",
      "-pix_fmt",
      "argb",
      "-c:a",
      "pcm_s16le",
      "-ar",
      String(project.metadata.audioSampleRate),
    );
  } else {
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      options.preset ?? "medium",
      "-crf",
      String(options.crf ?? 18),
      "-pix_fmt",
      evenCanvas ? "yuv420p" : "yuv444p",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "iec61966-2-1",
      "-colorspace",
      "bt709",
      "-c:a",
      "aac",
      "-ar",
      String(project.metadata.audioSampleRate),
    );
  }
  args.push(
    "-map_metadata",
    "-1",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    temporaryOutput,
  );
  return {
    args,
    filterGraph: filterLines.join(";\n"),
    temporaryOutput,
  };
}

async function consumeProgress(
  stream: ReadableStream<Uint8Array>,
  project: ResolvedProject,
  onProgress: RenderOptions["onProgress"],
  onDiagnostic: RenderOptions["onDiagnostic"],
  scope: string,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastDiagnosticBucket = -1;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("frame=")) continue;
      const frame = Number(line.slice("frame=".length));
      if (!Number.isFinite(frame)) continue;
      onProgress?.({
        phase: "encoding",
        progress: Math.min(1, frame / project.totalFrames),
        frame,
        totalFrames: project.totalFrames,
        message: `FFmpeg 已编码 ${frame}/${project.totalFrames} 帧`,
      });
      const bucket = Math.floor((frame / Math.max(1, project.totalFrames)) * 20);
      if (bucket !== lastDiagnosticBucket) {
        lastDiagnosticBucket = bucket;
        onDiagnostic?.({
          phase: scope === "ffmpeg/final" ? "encoding" : "preparing",
          scope,
          status: "progress",
          message: `FFmpeg 已处理 ${frame}/${project.totalFrames} 帧`,
          details: { frame, totalFrames: project.totalFrames },
        });
      }
    }
  }
}

export async function executeFfmpegPlan(
  project: ResolvedProject,
  prepared: Map<string, PreparedVisual>,
  outputSource: string,
  temporaryDirectory: string,
  options: RenderOptions,
  sceneUnits: ReadonlyMap<string, RenderModuleUnit> = new Map(),
  profile: FfmpegOutputProfile = "final",
): Promise<string> {
  const output = resolve(outputSource);
  const supported = new Set([".mp4", ".mov", ".mkv"]);
  if (!supported.has(extname(output).toLowerCase())) {
    fail("UNSUPPORTED_OUTPUT", "输出格式必须是 .mp4、.mov 或 .mkv", {
      output,
    });
  }
  if (existsSync(output) && !options.overwrite) {
    fail("OUTPUT_EXISTS", `输出文件已存在: ${output}`, { output });
  }
  await mkdir(dirname(output), { recursive: true });
  const plan = buildFfmpegPlan(
    project,
    prepared,
    output,
    options,
    sceneUnits,
    profile,
  );
  const filterPath = join(temporaryDirectory, "filter-complex.txt");
  await Bun.write(filterPath, plan.filterGraph);
  const args = plan.args.map((arg) =>
    arg === "__FILTER_SCRIPT__" ? filterPath : arg
  );
  const diagnosticPhase = profile === "final" ? "encoding" : "preparing";
  const diagnosticScope = profile === "final" ? "ffmpeg/final" : "ffmpeg/module";
  emitDiagnostic(options, {
    phase: diagnosticPhase,
    scope: diagnosticScope,
    status: "info",
    message: "FFmpeg 渲染计划已生成",
    details: {
      profile,
      output,
      temporaryOutput: plan.temporaryOutput,
      filterGraphPath: filterPath,
      filterGraphLines: plan.filterGraph.split("\n").length,
      command: [options.ffmpegPath ?? "ffmpeg", ...args],
    },
  });

  let process: ReturnType<typeof Bun.spawn>;
  try {
    process = Bun.spawn([options.ffmpegPath ?? "ffmpeg", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch (error) {
    fail(
      "FFMPEG_START_FAILED",
      `无法启动 FFmpeg: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  emitDiagnostic(options, {
    phase: diagnosticPhase,
    scope: diagnosticScope,
    status: "info",
    message: "FFmpeg 子进程已启动",
    details: { pid: process.pid, profile, totalFrames: project.totalFrames },
  });
  if (
    !(process.stdout instanceof ReadableStream) ||
    !(process.stderr instanceof ReadableStream)
  ) {
    fail("INTERNAL_ERROR", "FFmpeg 输出管道不可读");
  }
  const stderrPromise = new Response(process.stderr).text();
  const progressPromise = consumeProgress(
    process.stdout,
    project,
    options.onProgress,
    options.onDiagnostic,
    diagnosticScope,
  );
  const [exitCode, stderr] = await traceOperation(
    options,
    {
      phase: diagnosticPhase,
      scope: diagnosticScope,
      message: profile === "final"
        ? "等待最终 FFmpeg 编码"
        : "等待模块 FFmpeg 编码",
      details: { pid: process.pid, profile, totalFrames: project.totalFrames },
    },
    () => Promise.all([
      process.exited,
      stderrPromise,
      progressPromise,
    ]).then(([code, errorText]) => [code, errorText] as const),
  );
  if (exitCode !== 0) {
    await rm(plan.temporaryOutput, { force: true }).catch(() => {});
    if (options.signal?.aborted) {
      fail("RENDER_CANCELLED", "渲染已取消");
    }
    fail("FFMPEG_FAILED", "FFmpeg 渲染失败", {
      exitCode,
      stderr: stderr.trim().slice(-12_000),
      filterGraph: plan.filterGraph,
    });
  }
  if (!existsSync(plan.temporaryOutput)) {
    fail("FFMPEG_FAILED", "FFmpeg 成功退出但没有生成输出文件");
  }
  try {
    await rename(plan.temporaryOutput, output);
  } catch (error) {
    await rm(plan.temporaryOutput, { force: true }).catch(() => {});
    fail(
      "OUTPUT_COMMIT_FAILED",
      `无法提交输出文件: ${error instanceof Error ? error.message : String(error)}`,
      { output },
    );
  }
  return output;
}
