import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import React from "react";
import { resolveMotionPreviewExports } from "./artifact-protocol.ts";
import { hashSeed } from "./deterministic.ts";
import { fail } from "./errors.ts";
import { assertFfmpegTools, validateProjectMedia } from "./media-probe.ts";
import { evaluateVisualPlacement } from "./modifiers.ts";
import { loadProject } from "./project-compiler.ts";
import { renderModuleContentKey } from "./render-module-renderer.ts";
import { parseTimeToFrames } from "./time.ts";
import type {
  AudioNode,
  MotionNode,
  MotionPreviewContext,
  MotionPreviewDescriptor,
  PreviewAnnotation,
  PreviewOptions,
  PreviewPoint,
  PreviewPriority,
  PreviewRect,
  PreviewResult,
  RenderNode,
  RenderModuleNode,
  ResolvedProject,
  TransformNode,
  VisualNode,
} from "./types.ts";
import {
  bundleReactModule,
  loadProjectFonts,
  pngDataUri,
  rasterizeReact,
  renderSparseVisualFrame,
  type SatoriFont,
} from "./visual-renderer.ts";

type PreviewVisualNode = Exclude<RenderNode, AudioNode>;

interface PreparedFrame {
  node: PreviewVisualNode;
  path: string;
  localFrame: number;
}

interface PreparedSceneFrame {
  node: RenderModuleNode;
  path: string;
  localFrame: number;
}

type PreparedPreviewLayer =
  | ({ kind: "node" } & PreparedFrame)
  | ({ kind: "module" } & PreparedSceneFrame);

interface SvgLayer {
  priority: PreviewPriority;
  order: number;
  markup: string;
}

interface PendingLabel {
  text: string;
  x: number;
  y: number;
  color: string;
  priority: PreviewPriority;
  order: number;
}

const PRIORITY_ORDER: Record<PreviewPriority, number> = {
  decorative: 0,
  secondary: 1,
  primary: 2,
};
const TRANSFORM_COLOR = "#00D9FF";
const MOTION_COLOR = "#FFB000";

function finite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("INVALID_PREVIEW_DEFINITION", `${field} 必须是有限数值`);
  }
  return value;
}

function unit(value: unknown, field: string, fallback: number): number {
  if (value === undefined) return fallback;
  const number = finite(value, field);
  if (number < 0 || number > 1) {
    fail("INVALID_PREVIEW_DEFINITION", `${field} 必须位于 0—1`);
  }
  return number;
}

function validatePoint(value: unknown, field: string): PreviewPoint {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("INVALID_PREVIEW_DEFINITION", `${field} 必须是坐标对象`);
  }
  const point = value as Record<string, unknown>;
  return { x: finite(point.x, `${field}.x`), y: finite(point.y, `${field}.y`) };
}

function validateRect(value: unknown, field: string): PreviewRect {
  const point = validatePoint(value, field);
  const rectangle = value as Record<string, unknown>;
  const width = finite(rectangle.width, `${field}.width`);
  const height = finite(rectangle.height, `${field}.height`);
  if (width < 0 || height < 0) {
    fail("INVALID_PREVIEW_DEFINITION", `${field} 的 width/height 不能为负数`);
  }
  return { ...point, width, height };
}

function validateAnnotation(value: unknown, index: number): PreviewAnnotation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("INVALID_PREVIEW_DEFINITION", `annotations[${index}] 必须是对象`);
  }
  const annotation = value as Record<string, unknown>;
  const kind = annotation.kind;
  const color =
    annotation.color === undefined
      ? undefined
      : typeof annotation.color === "string"
        ? annotation.color
        : fail("INVALID_PREVIEW_DEFINITION", `annotations[${index}].color 必须是字符串`);
  if (kind === "ghost") {
    return {
      kind,
      ...(annotation.progress === undefined
        ? {}
        : { progress: unit(annotation.progress, `annotations[${index}].progress`, 1) }),
      ...(annotation.opacity === undefined
        ? {}
        : { opacity: unit(annotation.opacity, `annotations[${index}].opacity`, 0.35) }),
    };
  }
  if (kind === "outline") {
    return {
      kind,
      ...validateRect(annotation, `annotations[${index}]`),
      ...(annotation.rotation === undefined
        ? {}
        : { rotation: finite(annotation.rotation, `annotations[${index}].rotation`) }),
      ...(color === undefined ? {} : { color }),
    };
  }
  if (kind === "arrow") {
    return {
      kind,
      from: validatePoint(annotation.from, `annotations[${index}].from`),
      to: validatePoint(annotation.to, `annotations[${index}].to`),
      ...(color === undefined ? {} : { color }),
    };
  }
  if (kind === "path") {
    if (!Array.isArray(annotation.points) || annotation.points.length < 2) {
      fail("INVALID_PREVIEW_DEFINITION", `annotations[${index}].points 至少需要两个点`);
    }
    return {
      kind,
      points: annotation.points.map((point, pointIndex) =>
        validatePoint(point, `annotations[${index}].points[${pointIndex}]`)
      ),
      ...(color === undefined ? {} : { color }),
    };
  }
  if (kind === "arc") {
    const radius = finite(annotation.radius, `annotations[${index}].radius`);
    if (radius <= 0) {
      fail("INVALID_PREVIEW_DEFINITION", `annotations[${index}].radius 必须大于 0`);
    }
    return {
      kind,
      center: validatePoint(annotation.center, `annotations[${index}].center`),
      radius,
      startAngle: finite(annotation.startAngle, `annotations[${index}].startAngle`),
      endAngle: finite(annotation.endAngle, `annotations[${index}].endAngle`),
      ...(color === undefined ? {} : { color }),
    };
  }
  if (kind === "label") {
    if (typeof annotation.text !== "string" || annotation.text.length === 0) {
      fail("INVALID_PREVIEW_DEFINITION", `annotations[${index}].text 必须是非空字符串`);
    }
    return {
      kind,
      text: annotation.text,
      ...(annotation.x === undefined ? {} : { x: finite(annotation.x, `annotations[${index}].x`) }),
      ...(annotation.y === undefined ? {} : { y: finite(annotation.y, `annotations[${index}].y`) }),
      ...(color === undefined ? {} : { color }),
    };
  }
  fail("INVALID_PREVIEW_DEFINITION", `annotations[${index}].kind 不受支持: ${String(kind)}`);
}

function validateDescriptor(value: unknown): MotionPreviewDescriptor {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("INVALID_PREVIEW_DEFINITION", "Motion preview() 必须返回对象");
  }
  const descriptor = value as Record<string, unknown>;
  const prioritySource = descriptor.priority ?? "secondary";
  if (!["primary", "secondary", "decorative"].includes(String(prioritySource))) {
    fail("INVALID_PREVIEW_DEFINITION", `preview.priority 不受支持: ${String(prioritySource)}`);
  }
  if (descriptor.annotations !== undefined && !Array.isArray(descriptor.annotations)) {
    fail("INVALID_PREVIEW_DEFINITION", "preview.annotations 必须是数组");
  }
  if (descriptor.overlayBounds !== undefined && !Array.isArray(descriptor.overlayBounds)) {
    fail("INVALID_PREVIEW_DEFINITION", "preview.overlayBounds 必须是数组");
  }
  return {
    representativeProgress: unit(
      descriptor.representativeProgress,
      "preview.representativeProgress",
      1,
    ),
    priority: prioritySource as PreviewPriority,
    annotations: (descriptor.annotations ?? []).map(validateAnnotation),
    overlayBounds: (descriptor.overlayBounds ?? []).map((rect, index) =>
      validateRect(rect, `preview.overlayBounds[${index}]`)
    ),
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decimal(value: number): string {
  if (!Number.isFinite(value)) fail("INVALID_NUMBER", "Preview 数值不是有限数");
  return Number(value.toFixed(6)).toString();
}

function intersects(
  startFrame: number,
  endFrame: number,
  rangeStartFrame: number,
  rangeEndFrame: number,
): boolean {
  return startFrame < rangeEndFrame && endFrame > rangeStartFrame;
}

function localToCanvas(
  node: PreviewVisualNode,
  localFrame: number,
  point: PreviewPoint,
): PreviewPoint {
  const placement = evaluateVisualPlacement(node, localFrame);
  const radians = (placement.rotation * Math.PI) / 180;
  const dx = (point.x - node.width / 2) * placement.scaleX;
  const dy = (point.y - node.height / 2) * placement.scaleY;
  return {
    x: placement.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: placement.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

function boxesOverlap(left: PreviewRect, right: PreviewRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function placeLabel(
  label: PendingLabel,
  occupied: PreviewRect[],
  canvasWidth: number,
  canvasHeight: number,
): PreviewRect {
  const width = Math.min(canvasWidth, Math.max(48, label.text.length * 8 + 16));
  const height = 20;
  const candidates = [
    { x: label.x, y: label.y - height - 8 },
    { x: label.x + 8, y: label.y + 8 },
    { x: label.x - width - 8, y: label.y + 8 },
    { x: label.x, y: label.y - height / 2 },
    { x: 0, y: 0 },
    { x: canvasWidth - width, y: 0 },
    { x: 0, y: canvasHeight - height },
    { x: canvasWidth - width, y: canvasHeight - height },
  ].map((candidate) => ({
    x: Math.max(0, Math.min(canvasWidth - width, candidate.x)),
    y: Math.max(0, Math.min(canvasHeight - height, candidate.y)),
    width,
    height,
  }));
  const available = candidates.find(
    (candidate) => !occupied.some((box) => boxesOverlap(candidate, box)),
  );
  if (available !== undefined) return available;
  return candidates
    .map((candidate) => ({
      candidate,
      collisions: occupied.filter((box) => boxesOverlap(candidate, box)).length,
    }))
    .sort((left, right) => left.collisions - right.collisions)[0]!.candidate;
}

function arcPath(
  center: PreviewPoint,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const startRadians = (startAngle * Math.PI) / 180;
  const endRadians = (endAngle * Math.PI) / 180;
  const start = {
    x: center.x + radius * Math.cos(startRadians),
    y: center.y + radius * Math.sin(startRadians),
  };
  const end = {
    x: center.x + radius * Math.cos(endRadians),
    y: center.y + radius * Math.sin(endRadians),
  };
  const delta = Math.abs(endAngle - startAngle);
  return `M ${decimal(start.x)} ${decimal(start.y)} A ${decimal(radius)} ${decimal(radius)} 0 ${delta > 180 ? 1 : 0} ${endAngle >= startAngle ? 1 : 0} ${decimal(end.x)} ${decimal(end.y)}`;
}

function renderSvg(
  width: number,
  height: number,
  layers: SvgLayer[],
  labels: PendingLabel[],
  occupied: PreviewRect[],
): Uint8Array {
  const sortedLayers = [...layers].sort(
    (left, right) =>
      PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] ||
      left.order - right.order,
  );
  const labelMarkup: string[] = [];
  for (const label of [...labels].sort(
    (left, right) =>
      PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] ||
      left.order - right.order,
  )) {
    const box = placeLabel(label, occupied, width, height);
    occupied.push(box);
    labelMarkup.push(
      `<g><rect x="${decimal(box.x)}" y="${decimal(box.y)}" width="${decimal(box.width)}" height="${decimal(box.height)}" rx="5" fill="#101827E6" stroke="${escapeXml(label.color)}" stroke-width="1.5"/><text x="${decimal(box.x + 8)}" y="${decimal(box.y + 14)}" fill="#FFFFFF" font-size="11" font-family="sans-serif">${escapeXml(label.text)}</text></g>`,
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
${sortedLayers.map((layer) => layer.markup).join("\n")}
${labelMarkup.join("\n")}
</svg>`;
  return new Resvg(svg, { fitTo: { mode: "original" } }).render().asPng();
}

async function executeComposition(
  project: ResolvedProject,
  baseFrames: PreparedPreviewLayer[],
  overlays: string[],
  output: string,
  temporaryDirectory: string,
  options: PreviewOptions,
): Promise<void> {
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i",
    options.transparentBackground
      ? `color=c=black@0:s=${project.canvas.width}x${project.canvas.height}:r=${project.canvas.fpsSource},format=rgba`
      : `color=c=${project.canvas.background.replace(/^#/, "0x")}:s=${project.canvas.width}x${project.canvas.height}:r=${project.canvas.fpsSource}`,
  ];
  for (const frame of baseFrames) {
    args.push("-loop", "1", "-framerate", project.canvas.fpsSource, "-i", frame.path);
  }
  for (const overlay of overlays) {
    args.push("-loop", "1", "-framerate", project.canvas.fpsSource, "-i", overlay);
  }
  const filters: string[] = ["[0:v]format=rgba[canvas]"];
  let composite = "canvas";
  let inputIndex = 1;
  for (let index = 0; index < baseFrames.length; index++) {
    const frame = baseFrames[index]!;
    if (frame.kind === "module") {
      const visual = `preview_scene_${index}`;
      const next = `preview_composite_${index}`;
      filters.push(
        `[${inputIndex}:v]format=rgba,colorchannelmixer=aa=${decimal(frame.node.opacity)}[${visual}]`,
      );
      if (frame.node.blend === "normal") {
        filters.push(
          `[${composite}][${visual}]overlay=0:0:eof_action=pass:shortest=0[${next}]`,
        );
      } else {
        const baseKeep = `preview_scene_base_keep_${index}`;
        const baseBlend = `preview_scene_base_blend_${index}`;
        const topBlend = `preview_scene_top_blend_${index}`;
        const topMask = `preview_scene_top_mask_${index}`;
        const blended = `preview_scene_blended_${index}`;
        const mask = `preview_scene_mask_${index}`;
        filters.push(
          `[${composite}]split=2[${baseKeep}][${baseBlend}]`,
          `[${visual}]split=2[${topBlend}][${topMask}]`,
          `[${baseBlend}][${topBlend}]blend=all_mode=${frame.node.blend}[${blended}]`,
          `[${topMask}]alphaextract[${mask}]`,
          `[${baseKeep}][${blended}][${mask}]maskedmerge[${next}]`,
        );
      }
      composite = next;
      inputIndex++;
      continue;
    }
    const placement = evaluateVisualPlacement(frame.node, frame.localFrame);
    const width = Math.max(1, Math.round(frame.node.width * placement.scaleX));
    const height = Math.max(1, Math.round(frame.node.height * placement.scaleY));
    const visual = `preview_visual_${index}`;
    const next = `preview_composite_${index}`;
    const visualFilters = ["format=rgba", `scale=${width}:${height}`];
    const opacity =
      placement.scaleX === 0 || placement.scaleY === 0 ? 0 : placement.opacity;
    if (opacity !== 1) visualFilters.push(`colorchannelmixer=aa=${decimal(opacity)}`);
    if (placement.rotation !== 0) {
      visualFilters.push(
        `rotate=${decimal((placement.rotation * Math.PI) / 180)}:ow=rotw(iw):oh=roth(ih):c=black@0`,
      );
    }
    filters.push(`[${inputIndex}:v]${visualFilters.join(",")}[${visual}]`);
    filters.push(
      `[${composite}][${visual}]overlay=x=${decimal(placement.x)}-overlay_w/2:y=${decimal(placement.y)}-overlay_h/2:eof_action=pass:shortest=0[${next}]`,
    );
    composite = next;
    inputIndex++;
  }
  for (let index = 0; index < overlays.length; index++) {
    const next = `preview_overlay_${index}`;
    filters.push(
      `[${composite}][${inputIndex}:v]overlay=0:0:eof_action=pass:shortest=0[${next}]`,
    );
    composite = next;
    inputIndex++;
  }
  filters.push(`[${composite}]format=rgba[vout]`);
  const filterPath = join(temporaryDirectory, "preview-filter.txt");
  await Bun.write(filterPath, filters.join(";\n"));
  const temporaryOutput = join(
    dirname(output),
    `.${basename(output, extname(output))}.${crypto.randomUUID()}.preview.png`,
  );
  const process = Bun.spawn(
    [
      options.ffmpegPath ?? "ffmpeg",
      ...args,
      "-filter_complex_script", filterPath,
      "-map", "[vout]",
      "-frames:v", "1",
      "-c:v", "png",
      temporaryOutput,
    ],
    {
      stdout: "ignore",
      stderr: "pipe",
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
  );
  const [exitCode, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    await rm(temporaryOutput, { force: true }).catch(() => {});
    if (options.signal?.aborted) fail("RENDER_CANCELLED", "预览渲染已取消");
    fail("FFMPEG_FAILED", "FFmpeg Preview 合成失败", {
      exitCode,
      stderr: stderr.trim().slice(-12_000),
      filterGraph: filters.join(";\n"),
    });
  }
  if (!existsSync(temporaryOutput)) {
    fail("FFMPEG_FAILED", "FFmpeg 成功退出但没有生成 Preview PNG");
  }
  try {
    await rename(temporaryOutput, output);
  } catch (error) {
    await rm(temporaryOutput, { force: true }).catch(() => {});
    fail(
      "OUTPUT_COMMIT_FAILED",
      `无法提交 Preview PNG: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function motionContext(
  project: ResolvedProject,
  node: PreviewVisualNode,
  motion: MotionNode,
  anchorFrame: number,
  rangeStartFrame: number,
  rangeEndFrame: number,
): MotionPreviewContext {
  return {
    projectId: project.metadata.id,
    motionId: motion.id,
    hostId: node.id,
    fps: project.canvas.fps,
    seed: hashSeed(`${project.metadata.id}:${motion.id}:preview`),
    anchorFrame,
    rangeStartFrame,
    rangeEndFrame,
    canvas: { width: project.canvas.width, height: project.canvas.height },
    host: {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      startFrame: node.startFrame,
      endFrame: node.endFrame,
    },
    motion: {
      startFrame: motion.absoluteStartFrame,
      endFrame: motion.absoluteEndFrame,
      durationFrames: motion.durationFrames,
    },
  };
}

function modifierLocalFrame(motion: MotionNode, progress: number): number {
  return motion.localStartFrame + Math.round(progress * Math.max(0, motion.durationFrames - 1));
}

function transformPriority(transform: TransformNode): PreviewPriority {
  const first = transform.keyframes[0]!;
  return transform.keyframes.some(
    (keyframe) =>
      keyframe.translateX !== first.translateX ||
      keyframe.translateY !== first.translateY,
  )
    ? "primary"
    : "secondary";
}

function sceneSourceFrame(scene: RenderModuleNode, absoluteFrame: number): number {
  const outputFrame = Math.max(
    0,
    Math.min(scene.durationFrames - 1, absoluteFrame - scene.startFrame),
  );
  const span = scene.outFrame - scene.inFrame;
  if (scene.overflow === "loop") {
    return scene.inFrame + (outputFrame % span);
  }
  if (scene.overflow === "hold") {
    return scene.inFrame + Math.min(outputFrame, span - 1);
  }
  return scene.inFrame + Math.min(outputFrame, span - 1);
}

function scenePreviewRange(
  scene: RenderModuleNode,
  anchorFrame: number,
  rangeStartFrame: number,
  rangeEndFrame: number,
): { anchor: number; start: number; end: number } {
  const anchor = sceneSourceFrame(scene, anchorFrame);
  const intersectionStart = Math.max(rangeStartFrame, scene.startFrame);
  const intersectionEnd = Math.min(rangeEndFrame, scene.endFrame);
  if (intersectionStart >= intersectionEnd) {
    return { anchor, start: anchor, end: anchor + 1 };
  }
  const mappedStart = sceneSourceFrame(scene, intersectionStart);
  const mappedEnd = sceneSourceFrame(scene, intersectionEnd - 1) + 1;
  if (scene.overflow === "loop" && mappedEnd <= mappedStart) {
    return {
      anchor,
      start: scene.inFrame,
      end: scene.outFrame,
    };
  }
  return {
    anchor,
    start: Math.max(scene.inFrame, Math.min(mappedStart, anchor)),
    end: Math.min(scene.outFrame, Math.max(mappedEnd, anchor + 1)),
  };
}

async function prepareScenePreview(
  scene: RenderModuleNode,
  anchorFrame: number,
  rangeStartFrame: number,
  rangeEndFrame: number,
  options: PreviewOptions,
): Promise<{ path: string; annotatedModifierIds: string[] }> {
  const mapped = scenePreviewRange(
    scene,
    anchorFrame,
    rangeStartFrame,
    rangeEndFrame,
  );
  const contentKey = await renderModuleContentKey(scene);
  const previewKey = createHash("sha256").update(contentKey).update(JSON.stringify({
    inFrame: scene.inFrame,
    outFrame: scene.outFrame,
    durationFrames: scene.durationFrames,
    overflow: scene.overflow,
    anchor: mapped.anchor,
    rangeStart: mapped.start,
    rangeEnd: mapped.end,
  })).digest("hex");
  const directory = join(
    scene.project.rootProjectDir,
    ".render-cache",
    scene.kind === "scene" ? "scenes" : "templates",
    contentKey,
    "previews",
  );
  const path = join(directory, `${previewKey}.png`);
  const annotatedModifierIds = scene.project.nodes.flatMap((node) =>
    node.kind === "audio"
      ? []
      : node.modifiers
          .filter(
            (modifier) =>
              modifier.enabled &&
              intersects(
                modifier.absoluteStartFrame,
                modifier.absoluteEndFrame,
                mapped.start,
                mapped.end,
              ),
          )
          .map((modifier) => modifier.id)
  );
  if (existsSync(path)) return { path, annotatedModifierIds };
  await mkdir(directory, { recursive: true });
  const hasPreviewNodes = scene.project.nodes.some(
    (node) => node.kind !== "audio" && node.enabled && node.preview,
  ) || scene.project.sceneNodes.some((node) => node.preview) ||
    scene.project.templateNodes.some((node) => node.preview);
  if (!hasPreviewNodes) {
    const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.project.canvas.width}" height="${scene.project.canvas.height}"/>`;
    await Bun.write(
      path,
      new Resvg(emptySvg, { fitTo: { mode: "original" } }).render().asPng(),
    );
    return { path, annotatedModifierIds: [] };
  }
  const result = await renderProjectPreview(
    scene.sourcePath,
    {
      output: path,
      anchor: `${mapped.anchor}f`,
      rangeStart: `${mapped.start}f`,
      rangeEnd: `${mapped.end}f`,
      overwrite: true,
      validateMedia: false,
      transparentBackground: true,
      ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
      ...(options.ffprobePath === undefined ? {} : { ffprobePath: options.ffprobePath }),
      ...(options.frameConcurrency === undefined
        ? {}
        : { frameConcurrency: options.frameConcurrency }),
      ...(options.domPages === undefined ? {} : { domPages: options.domPages }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
    scene.project,
  );
  return { path, annotatedModifierIds: result.annotatedModifierIds };
}

export async function renderProjectPreview(
  projectPath: string,
  options: PreviewOptions,
  resolvedProject?: ResolvedProject,
): Promise<PreviewResult> {
  const startedAt = performance.now();
  const output = resolve(options.output);
  if (extname(output).toLowerCase() !== ".png") {
    fail("UNSUPPORTED_OUTPUT", "Preview 输出格式必须是 .png", { output });
  }
  if (existsSync(output) && !options.overwrite) {
    fail("OUTPUT_EXISTS", `输出文件已存在: ${output}`, { output });
  }
  if (
    options.frameConcurrency !== undefined &&
    (!Number.isInteger(options.frameConcurrency) || options.frameConcurrency <= 0)
  ) {
    fail("INVALID_RENDER_OPTION", "frameConcurrency 必须是正整数");
  }
  if (
    options.domPages !== undefined &&
    (!Number.isInteger(options.domPages) || options.domPages <= 0)
  ) {
    fail("INVALID_RENDER_OPTION", "domPages 必须是正整数");
  }
  if (options.signal?.aborted) fail("RENDER_CANCELLED", "预览渲染已取消");

  const project = resolvedProject ?? await loadProject(projectPath, {
    ...(options.tts === undefined ? {} : { tts: options.tts }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const anchorFrame = parseTimeToFrames(options.anchor, project.canvas.fpsSource, "preview.anchor");
  const rangeStartFrame = parseTimeToFrames(
    options.rangeStart,
    project.canvas.fpsSource,
    "preview.rangeStart",
  );
  const rangeEndFrame = parseTimeToFrames(
    options.rangeEnd,
    project.canvas.fpsSource,
    "preview.rangeEnd",
  );
  if (anchorFrame < 0 || anchorFrame >= project.totalFrames) {
    fail(
      "INVALID_PREVIEW_TIME",
      `Anchor ${anchorFrame}f 必须位于 [0, ${project.totalFrames})`,
    );
  }
  if (
    rangeStartFrame < 0 ||
    rangeStartFrame >= rangeEndFrame ||
    rangeEndFrame > project.totalFrames
  ) {
    fail(
      "INVALID_PREVIEW_TIME",
      `Preview Range [${rangeStartFrame}, ${rangeEndFrame}) 必须位于 [0, ${project.totalFrames}] 且非空`,
    );
  }
  await assertFfmpegTools(options.ffmpegPath, options.ffprobePath);
  if (options.validateMedia ?? true) {
    await validateProjectMedia(project, options.ffprobePath);
  }
  const selectedNodes = project.nodes.filter(
    (node): node is PreviewVisualNode =>
      node.kind !== "audio" && node.enabled && node.preview,
  );
  const selectedScenes: RenderModuleNode[] = [
    ...project.sceneNodes,
    ...project.templateNodes,
  ].filter((scene) => scene.preview);
  if (selectedNodes.length === 0 && selectedScenes.length === 0) {
    fail("NO_PREVIEW_NODES", "工程中没有启用且 preview=true 的视觉节点");
  }
  await mkdir(dirname(output), { recursive: true });
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "fourier-preview-"));
  try {
    const frameDirectory = join(temporaryDirectory, "frames");
    const bundleDirectory = join(temporaryDirectory, "bundles");
    const overlayDirectory = join(temporaryDirectory, "overlays");
    await Promise.all([
      mkdir(frameDirectory, { recursive: true }),
      mkdir(bundleDirectory, { recursive: true }),
      mkdir(overlayDirectory, { recursive: true }),
    ]);
    const needsFonts = selectedNodes.some(
      (node) =>
        node.kind === "react" ||
        node.modifiers.some(
          (modifier) => modifier.kind === "motion" && modifier.enabled,
        ),
    );
    const fonts: SatoriFont[] = needsFonts
      ? await loadProjectFonts(project.resourceRoots)
      : [];
    const frameCache = new Map<string, Promise<string>>();
    const frameFor = (node: PreviewVisualNode, localFrame: number): Promise<string> => {
      const key = `${node.id}:${localFrame}`;
      const cached = frameCache.get(key);
      if (cached !== undefined) return cached;
      const promise = (async () => {
        const path = join(frameDirectory, `${node.id}-${localFrame}.png`);
        await renderSparseVisualFrame(project, node, localFrame, path, {
          bundleDirectory,
          fonts,
          ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
          ...(options.domPages === undefined ? {} : { domPages: options.domPages }),
        });
        return path;
      })();
      frameCache.set(key, promise);
      return promise;
    };

    const activeNodes = selectedNodes
      .filter((node) => node.startFrame <= anchorFrame && anchorFrame < node.endFrame)
      .sort(
        (left, right) =>
          left.layer - right.layer || left.declarationOrder - right.declarationOrder,
      );
    const nodeFrames: PreparedPreviewLayer[] = await Promise.all(
      activeNodes.map(async (node) => {
        const localFrame = anchorFrame - node.startFrame;
        return {
          kind: "node" as const,
          node,
          localFrame,
          path: await frameFor(node, localFrame),
        };
      }),
    );
    const activeScenes = selectedScenes.filter(
      (scene) => scene.startFrame <= anchorFrame && anchorFrame < scene.endFrame,
    );
    const scenePreviewResults = await Promise.all(
      activeScenes.map(async (node) => ({
        node,
        result: await prepareScenePreview(
          node,
          anchorFrame,
          rangeStartFrame,
          rangeEndFrame,
          options,
        ),
      })),
    );
    const sceneFrames: PreparedPreviewLayer[] = scenePreviewResults.map(
      ({ node, result }) => ({
        kind: "module",
        node,
        localFrame: anchorFrame - node.startFrame,
        path: result.path,
      }),
    );
    const baseFrames = [...nodeFrames, ...sceneFrames].sort(
      (left, right) =>
        left.node.layer - right.node.layer ||
        left.node.declarationOrder - right.node.declarationOrder,
    );
    const modifiers = selectedNodes
      .flatMap((node) =>
        node.modifiers
          .filter(
            (modifier) =>
              modifier.enabled &&
              intersects(
                modifier.absoluteStartFrame,
                modifier.absoluteEndFrame,
                rangeStartFrame,
                rangeEndFrame,
              ),
          )
          .map((modifier) => ({ node, modifier })),
      )
      .sort(
        (left, right) =>
          left.modifier.absoluteStartFrame - right.modifier.absoluteStartFrame ||
          left.modifier.declarationOrder - right.modifier.declarationOrder,
      );

    const layers: SvgLayer[] = [];
    const labels: PendingLabel[] = [];
    const occupied: PreviewRect[] = nodeFrames.map((frame) => {
      if (frame.kind !== "node") throw new Error("expected node preview frame");
      const placement = evaluateVisualPlacement(frame.node, frame.localFrame);
      const width = frame.node.width * placement.scaleX;
      const height = frame.node.height * placement.scaleY;
      return {
        x: placement.x - width / 2,
        y: placement.y - height / 2,
        width,
        height,
      };
    });
    const customOverlays: string[] = [];
    let order = 0;
    const addLabel = (
      text: string,
      x: number,
      y: number,
      color: string,
      priority: PreviewPriority,
    ): void => {
      labels.push({ text, x, y, color, priority, order: order++ });
    };
    const addGhost = async (
      node: PreviewVisualNode,
      localFrame: number,
      opacity: number,
      priority: PreviewPriority,
    ): Promise<void> => {
      const path = await frameFor(node, localFrame);
      const placement = evaluateVisualPlacement(node, localFrame);
      const uri = await pngDataUri(path);
      layers.push({
        priority,
        order: order++,
        markup: `<image href="${uri}" x="${decimal(-node.width / 2)}" y="${decimal(-node.height / 2)}" width="${node.width}" height="${node.height}" opacity="${decimal(opacity)}" transform="translate(${decimal(placement.x)} ${decimal(placement.y)}) rotate(${decimal(placement.rotation)}) scale(${decimal(placement.scaleX)} ${decimal(placement.scaleY)})"/>`,
      });
    };

    for (const { node, modifier } of modifiers) {
      if (modifier.kind === "transform") {
        const priority = transformPriority(modifier);
        const points: PreviewPoint[] = [];
        modifier.keyframes.forEach((keyframe) => {
          const x = node.x + keyframe.translateX;
          const y = node.y + keyframe.translateY;
          const width = node.width * keyframe.scaleX;
          const height = node.height * keyframe.scaleY;
          const rotation = node.rotation + keyframe.rotation;
          points.push({ x, y });
          layers.push({
            priority,
            order: order++,
            markup: `<rect x="${decimal(x - width / 2)}" y="${decimal(y - height / 2)}" width="${decimal(width)}" height="${decimal(height)}" fill="none" stroke="${TRANSFORM_COLOR}" stroke-width="2" stroke-dasharray="7 5" opacity="${decimal(Math.max(0.25, keyframe.opacity))}" transform="rotate(${decimal(rotation)} ${decimal(x)} ${decimal(y)})"/>`,
          });
        });
        if (points.length > 1) {
          const pointList = points.map((point) => `${decimal(point.x)},${decimal(point.y)}`).join(" ");
          layers.push({
            priority,
            order: order++,
            markup: `<polyline points="${pointList}" fill="none" stroke="${TRANSFORM_COLOR}" stroke-width="2.5" marker-end="url(#arrow)"/>`,
          });
        }
        const first = modifier.keyframes[0]!;
        const last = modifier.keyframes.at(-1)!;
        if (first.rotation !== last.rotation) {
          const center = points.at(-1)!;
          layers.push({
            priority,
            order: order++,
            markup: `<path d="${arcPath(center, Math.max(14, Math.min(node.width, node.height) / 2 + 8), first.rotation, last.rotation)}" fill="none" stroke="${TRANSFORM_COLOR}" stroke-width="2" marker-end="url(#arrow)"/>`,
          });
        }
        const labelPoint = points.at(-1)!;
        addLabel(
          `${modifier.id}  ${modifier.absoluteStartFrame}f–${modifier.absoluteEndFrame}f`,
          labelPoint.x,
          labelPoint.y - node.height / 2,
          TRANSFORM_COLOR,
          priority,
        );
        continue;
      }

      const previewContext = motionContext(
        project,
        node,
        modifier,
        anchorFrame,
        rangeStartFrame,
        rangeEndFrame,
      );
      const module = await bundleReactModule(
        modifier,
        bundleDirectory,
        project.resourceRoots,
      );
      const motionPreviewExports = resolveMotionPreviewExports(
        module,
        modifier.exportName,
        {
          ...(modifier.propTypes === undefined
            ? {}
            : { declarations: modifier.propTypes }),
        },
      );
      const previewExport = motionPreviewExports.preview;
      const customPreview = motionPreviewExports.Preview;
      let descriptor: MotionPreviewDescriptor;
      let fallback = false;
      if (previewExport === undefined) {
        descriptor = {
          representativeProgress: 1,
          priority: "secondary",
          annotations: [],
          overlayBounds: [],
        };
        fallback = true;
      } else {
        if (typeof previewExport !== "function") {
          fail("INVALID_PREVIEW_DEFINITION", `Motion "${modifier.id}" 的 preview 导出必须是函数`);
        }
        const value = previewExport({ props: modifier.props, previewContext });
        if (
          typeof value === "object" &&
          value !== null &&
          "then" in value &&
          typeof (value as { then?: unknown }).then === "function"
        ) {
          fail("INVALID_PREVIEW_DEFINITION", `Motion "${modifier.id}" 的 preview() 必须同步返回`);
        }
        descriptor = validateDescriptor(value);
      }
      const priority = descriptor.priority ?? "secondary";
      const representativeProgress = descriptor.representativeProgress ?? 1;
      const representativeFrame = modifierLocalFrame(modifier, representativeProgress);
      await addGhost(node, representativeFrame, fallback ? 0.45 : 0.32, priority);
      if (fallback) {
        addLabel(
          `${modifier.id}: 未定义预览表现`,
          node.x,
          node.y - node.height / 2,
          MOTION_COLOR,
          priority,
        );
      }
      let hasMotionLabel = fallback;
      for (const annotation of descriptor.annotations ?? []) {
        const color = "color" in annotation && annotation.color !== undefined
          ? annotation.color
          : MOTION_COLOR;
        if (annotation.kind === "ghost") {
          const progress = annotation.progress ?? representativeProgress;
          await addGhost(
            node,
            modifierLocalFrame(modifier, progress),
            annotation.opacity ?? 0.35,
            priority,
          );
        } else if (annotation.kind === "outline") {
          const center = localToCanvas(node, representativeFrame, {
            x: annotation.x + annotation.width / 2,
            y: annotation.y + annotation.height / 2,
          });
          const placement = evaluateVisualPlacement(node, representativeFrame);
          const width = annotation.width * placement.scaleX;
          const height = annotation.height * placement.scaleY;
          const rotation = placement.rotation + (annotation.rotation ?? 0);
          layers.push({
            priority,
            order: order++,
            markup: `<rect x="${decimal(center.x - width / 2)}" y="${decimal(center.y - height / 2)}" width="${decimal(width)}" height="${decimal(height)}" fill="none" stroke="${escapeXml(color)}" stroke-width="2" stroke-dasharray="7 5" transform="rotate(${decimal(rotation)} ${decimal(center.x)} ${decimal(center.y)})"/>`,
          });
        } else if (annotation.kind === "arrow") {
          const from = localToCanvas(node, representativeFrame, annotation.from);
          const to = localToCanvas(node, representativeFrame, annotation.to);
          layers.push({
            priority,
            order: order++,
            markup: `<line x1="${decimal(from.x)}" y1="${decimal(from.y)}" x2="${decimal(to.x)}" y2="${decimal(to.y)}" stroke="${escapeXml(color)}" stroke-width="2.5" marker-end="url(#arrow)"/>`,
          });
        } else if (annotation.kind === "path") {
          const points = annotation.points.map((point) =>
            localToCanvas(node, representativeFrame, point)
          );
          layers.push({
            priority,
            order: order++,
            markup: `<polyline points="${points.map((point) => `${decimal(point.x)},${decimal(point.y)}`).join(" ")}" fill="none" stroke="${escapeXml(color)}" stroke-width="2" marker-end="url(#arrow)"/>`,
          });
        } else if (annotation.kind === "arc") {
          const center = localToCanvas(node, representativeFrame, annotation.center);
          layers.push({
            priority,
            order: order++,
            markup: `<path d="${arcPath(center, annotation.radius, annotation.startAngle, annotation.endAngle)}" fill="none" stroke="${escapeXml(color)}" stroke-width="2" marker-end="url(#arrow)"/>`,
          });
        } else if (annotation.kind === "label") {
          hasMotionLabel = true;
          const point = localToCanvas(node, representativeFrame, {
            x: annotation.x ?? node.width / 2,
            y: annotation.y ?? 0,
          });
          addLabel(annotation.text, point.x, point.y, color, priority);
        }
      }
      if (!hasMotionLabel) {
        addLabel(
          `${modifier.id}  ${modifier.absoluteStartFrame}f–${modifier.absoluteEndFrame}f`,
          node.x,
          node.y + node.height / 2,
          MOTION_COLOR,
          priority,
        );
      }
      if (customPreview !== undefined) {
        if (
          typeof customPreview !== "function" &&
          (typeof customPreview !== "object" || customPreview === null)
        ) {
          fail("INVALID_PREVIEW_DEFINITION", `Motion "${modifier.id}" 的 Preview 导出必须是 React 组件`);
        }
        if ((descriptor.overlayBounds ?? []).length === 0) {
          fail("INVALID_PREVIEW_DEFINITION", `Motion "${modifier.id}" 使用 Preview 组件时必须声明 overlayBounds`);
        }
        occupied.push(...(descriptor.overlayBounds ?? []));
        const subject = node.kind === "text" || node.kind === "subtitle"
          ? node.content
          : React.createElement("img", {
              src: await pngDataUri(
                await frameFor(node, representativeFrame),
              ),
              width: node.width,
              height: node.height,
              style: { width: node.width, height: node.height },
            });
        const element = React.createElement(
          "div",
          {
            style: {
              width: project.canvas.width,
              height: project.canvas.height,
              display: "flex",
              position: "relative",
            },
          },
          React.createElement(customPreview as React.ElementType, {
            subject,
            props: modifier.props,
            previewContext,
            descriptor,
          }),
        );
        const overlayPath = join(overlayDirectory, `motion-${modifier.id}.png`);
        await Bun.write(
          overlayPath,
          await rasterizeReact(
            element,
            project.canvas.width,
            project.canvas.height,
            fonts,
          ),
        );
        customOverlays.push(overlayPath);
      }
    }

    const overlays: string[] = [];
    if (layers.length > 0 || labels.length > 0) {
      const annotationPath = join(overlayDirectory, "annotations.png");
      await Bun.write(
        annotationPath,
        renderSvg(
          project.canvas.width,
          project.canvas.height,
          layers,
          labels,
          occupied,
        ),
      );
      overlays.push(annotationPath);
    }
    overlays.push(...customOverlays);
    await executeComposition(
      project,
      baseFrames,
      overlays,
      output,
      temporaryDirectory,
      options,
    );
    return {
      output,
      projectId: project.metadata.id,
      totalFrames: project.totalFrames,
      durationSeconds: project.totalFrames / project.canvas.fps,
      anchorFrame,
      rangeStartFrame,
      rangeEndFrame,
      selectedNodeIds: [
        ...selectedNodes.map((node) => node.id),
        ...selectedScenes.map((scene) => scene.id),
      ],
      annotatedModifierIds: [
        ...modifiers.map(({ modifier }) => modifier.id),
        ...scenePreviewResults.flatMap(({ node, result }) =>
          result.annotatedModifierIds.map((id) => `${node.id}/${id}`)
        ),
      ],
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    if (!options.keepTemporaryFiles) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
    }
  }
}
