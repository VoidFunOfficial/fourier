import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { fail } from "./errors.ts";
import { executeFfmpegPlan } from "./ffmpeg.ts";
import { emitDiagnostic, traceOperation } from "./render-diagnostics.ts";
import { framesToSamples } from "./time.ts";
import type {
  RenderOptions,
  RenderModuleNode,
  RenderModuleUnit,
  ResolvedProject,
  SceneNode,
  SceneRenderUnit,
} from "./types.ts";
import {
  collectComponentDependencies,
  prepareGeneratedVisuals,
} from "./visual-renderer.ts";
import type { VisualTimelineRuntime } from "./visual-timeline-runtime.ts";

export interface PrepareRenderModuleOptions {
  temporaryDirectory: string;
  ffmpegPath?: string;
  frameConcurrency?: number;
  domPages?: number;
  timelineRuntime?: VisualTimelineRuntime;
  signal?: AbortSignal;
  onProgress?: RenderOptions["onProgress"];
  onDiagnostic?: RenderOptions["onDiagnostic"];
}

export type PrepareSceneOptions = PrepareRenderModuleOptions;

const CACHE_SCHEMA_VERSION = "v3";
const RENDERER_VERSION = "1.0.0";
const EXCLUDED_DIRECTORIES = new Set([".render-cache", "output", "node_modules"]);

function decimal(value: number): string {
  if (!Number.isFinite(value)) {
    fail("INVALID_NUMBER", "Render Module FFmpeg 数值不是有限数");
  }
  return Number(value.toFixed(12)).toString();
}

function cacheSchema(node: RenderModuleNode): string {
  return `fourier-${node.kind}-unit-${CACHE_SCHEMA_VERSION}`;
}

function cacheKindDirectory(node: RenderModuleNode): "scenes" | "templates" {
  return node.kind === "scene" ? "scenes" : "templates";
}

async function collectDirectoryFiles(
  directory: string,
  excludedRoots: readonly string[] = [],
): Promise<string[]> {
  const files: string[] = [];
  const visit = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory() && excludedRoots.some((root) => root === path)) {
        continue;
      }
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  await visit(directory);
  return files.sort();
}

async function collectProjectDependencies(
  project: ResolvedProject,
): Promise<string[]> {
  const paths = new Set<string>();
  if (project.sourcePath !== undefined) paths.add(project.sourcePath);
  const components: Array<{
    id: string;
    component: string;
    componentPath: string;
    exportName: string;
  }> = [];
  for (const node of project.nodes) {
    if (node.kind === "video" || node.kind === "audio" || node.kind === "image") {
      paths.add(node.sourcePath);
    }
    if (node.kind === "text" || node.kind === "subtitle") {
      paths.add(node.fontPath);
      if (node.voice !== undefined) paths.add(node.voice.sourcePath);
    }
    if (node.kind === "react") components.push(node);
    for (const modifier of node.kind === "audio" ? [] : node.modifiers) {
      if (modifier.kind === "motion" && modifier.enabled) {
        components.push(modifier);
      }
    }
  }
  for (const component of components) {
    const dependencies = await collectComponentDependencies(
      component,
      project.resourceRoots,
    );
    for (const path of dependencies) paths.add(path);
  }
  if (components.length > 0) {
    for (const root of project.resourceRoots) {
      const fontsDirectory = join(root, "fonts");
      if (!existsSync(fontsDirectory)) continue;
      for (const path of await collectDirectoryFiles(fontsDirectory)) paths.add(path);
    }
  }
  return [...paths].sort();
}

export async function renderModuleContentKey(
  node: RenderModuleNode,
  childUnits: ReadonlyMap<string, RenderModuleUnit> = new Map(),
  onDiagnostic?: RenderOptions["onDiagnostic"],
): Promise<string> {
  const diagnosticTarget = {
    ...(onDiagnostic === undefined ? {} : { onDiagnostic }),
  };
  const hash = createHash("sha256");
  hash.update(cacheSchema(node));
  hash.update(RENDERER_VERSION);
  hash.update(node.project.sourceFingerprint ?? "");
  hash.update(JSON.stringify({
    canvas: node.project.canvas,
    audioSampleRate: node.project.metadata.audioSampleRate,
    totalFrames: node.project.totalFrames,
    ...(node.kind === "template"
      ? {
          parameterContract: node.parameterContract,
          bindings: Object.fromEntries(
            Object.entries(node.bindings).sort(([left], [right]) =>
              left.localeCompare(right)
            ),
          ),
        }
      : {}),
  }));
  const dependencies = await collectProjectDependencies(
    node.project,
  );
  emitDiagnostic(diagnosticTarget, {
    phase: "preparing",
    scope: `module/${node.kind}/${node.id}/hash`,
    status: "info",
    message: `发现 ${dependencies.length} 个内容哈希依赖`,
    details: { dependencies: dependencies.length, childUnits: childUnits.size },
  });
  const reportEvery = Math.max(1, Math.ceil(dependencies.length / 20));
  for (let index = 0; index < dependencies.length; index++) {
    const path = dependencies[index];
    if (path === undefined) continue;
    hash.update(relative(node.project.rootProjectDir, path));
    hash.update(new Uint8Array(await Bun.file(path).arrayBuffer()));
    if (
      index === 0 ||
      index === dependencies.length - 1 ||
      (index + 1) % reportEvery === 0
    ) {
      emitDiagnostic(diagnosticTarget, {
        phase: "preparing",
        scope: `module/${node.kind}/${node.id}/hash`,
        status: "progress",
        message: `内容哈希 ${index + 1}/${dependencies.length}`,
        details: {
          current: index + 1,
          total: dependencies.length,
          path: relative(node.project.rootProjectDir, path),
        },
      });
    }
  }
  for (const [id, unit] of [...childUnits].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    hash.update(id);
    hash.update(unit.moduleKind);
    hash.update(unit.unitKey);
  }
  return hash.digest("hex");
}

export function sceneContentKey(scene: SceneNode): Promise<string> {
  return renderModuleContentKey(scene);
}

export function templateContentKey(
  template: Extract<RenderModuleNode, { kind: "template" }>,
  childUnits: ReadonlyMap<string, RenderModuleUnit> = new Map(),
): Promise<string> {
  return renderModuleContentKey(template, childUnits);
}

function unitKeyFor(node: RenderModuleNode, contentKey: string): string {
  return createHash("sha256")
    .update(cacheSchema(node))
    .update(contentKey)
    .update(JSON.stringify({
      inFrame: node.inFrame,
      outFrame: node.outFrame,
      durationFrames: node.durationFrames,
      overflow: node.overflow,
    }))
    .digest("hex");
}

async function fileSha256(path: string): Promise<{ size: number; sha256: string }> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    const bytes = chunk as Buffer;
    size += bytes.byteLength;
    hash.update(bytes);
  }
  return { size, sha256: hash.digest("hex") };
}

async function quarantineModuleCache(
  directory: string,
  reason: string,
  node: RenderModuleNode,
  options: PrepareRenderModuleOptions,
): Promise<void> {
  if (!existsSync(directory)) return;
  const quarantine = `${directory}.corrupt-${crypto.randomUUID()}`;
  try {
    await rename(directory, quarantine);
    await rm(quarantine, { recursive: true, force: true }).catch(() => {});
  } catch {
    // Another renderer may already have replaced or quarantined the entry.
  }
  emitDiagnostic(options, {
    phase: "preparing",
    scope: `module/${node.kind}/${node.id}/cache`,
    status: "info",
    message: "模块缓存条目损坏，已隔离并重新生成",
    details: { directory, reason },
  });
}

async function readModuleCache(input: {
  directory: string;
  filename: string;
  node: RenderModuleNode;
  contentKey: string;
  unitKey?: string;
  options: PrepareRenderModuleOptions;
}): Promise<string | undefined> {
  if (!existsSync(input.directory)) return undefined;
  try {
    const manifest = await Bun.file(join(input.directory, "manifest.json")).json() as Record<string, unknown>;
    if (
      manifest.schema !== cacheSchema(input.node) ||
      manifest.rendererVersion !== RENDERER_VERSION ||
      manifest.contentKey !== input.contentKey ||
      (input.unitKey === undefined
        ? manifest.unitKey !== undefined
        : manifest.unitKey !== input.unitKey)
    ) throw new Error("manifest schema 或内容键无效");
    const file = manifest.file as Record<string, unknown> | undefined;
    if (
      file?.path !== input.filename ||
      typeof file.sha256 !== "string" ||
      !Number.isSafeInteger(file.size) ||
      (file.size as number) < 0
    ) throw new Error("manifest 媒体文件记录无效");
    const path = join(input.directory, input.filename);
    const actual = await fileSha256(path);
    if (actual.sha256 !== file.sha256 || actual.size !== file.size) {
      throw new Error("媒体文件哈希校验失败");
    }
    return path;
  } catch (error) {
    await quarantineModuleCache(
      input.directory,
      error instanceof Error ? error.message : String(error),
      input.node,
      input.options,
    );
    return undefined;
  }
}

async function writeModuleCacheManifest(input: {
  directory: string;
  filename: string;
  node: RenderModuleNode;
  contentKey: string;
  unitKey?: string;
}): Promise<void> {
  const path = join(input.directory, input.filename);
  await Bun.write(join(input.directory, "manifest.json"), `${JSON.stringify({
    schema: cacheSchema(input.node),
    rendererVersion: RENDERER_VERSION,
    contentKey: input.contentKey,
    ...(input.unitKey === undefined ? {} : { unitKey: input.unitKey }),
    source: input.node.sourcePath,
    totalFrames: input.unitKey === undefined
      ? input.node.rawDurationFrames
      : input.node.durationFrames,
    moduleKind: input.node.kind,
    ...(input.node.kind === "template" ? { bindings: input.node.bindings } : {}),
    file: { path: input.filename, ...(await fileSha256(path)) },
    createdAt: new Date().toISOString(),
  }, null, 2)}\n`);
}

async function renderRawModule(
  node: RenderModuleNode,
  contentKey: string,
  options: PrepareRenderModuleOptions,
  childUnits: ReadonlyMap<string, RenderModuleUnit>,
): Promise<string> {
  const cacheDirectory = join(
    node.project.rootProjectDir,
    ".render-cache",
    cacheKindDirectory(node),
    contentKey,
  );
  const cachedOutput = await readModuleCache({
    directory: cacheDirectory,
    filename: "raw.mov",
    node,
    contentKey,
    options,
  });
  if (cachedOutput !== undefined) {
    emitDiagnostic(options, {
      phase: "preparing",
      scope: `module/${node.kind}/${node.id}/raw`,
      status: "cache-hit",
      message: "复用模块原始视频缓存",
      details: { output: cachedOutput, contentKey },
    });
    return cachedOutput;
  }
  const output = join(cacheDirectory, "raw.mov");
  emitDiagnostic(options, {
    phase: "preparing",
    scope: `module/${node.kind}/${node.id}/raw`,
    status: "info",
    message: "模块原始视频缓存未命中，将生成视觉帧并编码",
    details: { output, contentKey },
  });
  const cacheRoot = join(
    node.project.rootProjectDir,
    ".render-cache",
    cacheKindDirectory(node),
  );
  await mkdir(cacheRoot, { recursive: true });
  const staging = join(cacheRoot, `.${contentKey}-${crypto.randomUUID()}.staging`);
  await mkdir(staging, { recursive: true });
  const workingDirectory = join(
    options.temporaryDirectory,
    `${node.kind}-${contentKey}-${crypto.randomUUID()}`,
  );
  await mkdir(workingDirectory, { recursive: true });
  const candidate = join(staging, "raw.mov");
  try {
    const prepared = await prepareGeneratedVisuals(node.project, {
      temporaryDirectory: workingDirectory,
      ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
      ...(options.frameConcurrency === undefined
        ? {}
        : { frameConcurrency: options.frameConcurrency }),
      ...(options.domPages === undefined ? {} : { domPages: options.domPages }),
      ...(options.timelineRuntime === undefined
        ? {}
        : { timelineRuntime: options.timelineRuntime }),
      ...(options.onDiagnostic === undefined
        ? {}
        : { onDiagnostic: options.onDiagnostic }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    await executeFfmpegPlan(
      node.project,
      prepared,
      candidate,
      workingDirectory,
      {
        output: candidate,
        overwrite: true,
        ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
        ...(options.onDiagnostic === undefined
          ? {}
          : { onDiagnostic: options.onDiagnostic }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
      childUnits,
      "module",
    );
    await writeModuleCacheManifest({
      directory: staging,
      filename: "raw.mov",
      node,
      contentKey,
    });
    try {
      await rename(staging, cacheDirectory);
    } catch (error) {
      const winner = await readModuleCache({
        directory: cacheDirectory,
        filename: "raw.mov",
        node,
        contentKey,
        options,
      });
      if (winner !== undefined) return winner;
      if (existsSync(cacheDirectory)) throw error;
      await rename(staging, cacheDirectory);
    }
    return output;
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    await rm(workingDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

function derivedFilters(node: RenderModuleNode): { video: string; audio: string } {
  const span = node.outFrame - node.inFrame;
  const target = node.durationFrames;
  const sourceStart = decimal(node.inFrame / node.project.canvas.fps);
  const sourceEnd = decimal(node.outFrame / node.project.canvas.fps);
  const targetSeconds = decimal(target / node.project.canvas.fps);
  const video = [
    `trim=start_frame=${node.inFrame}:end_frame=${node.outFrame}`,
    "setpts=PTS-STARTPTS",
  ];
  const audio = [
    `atrim=start=${sourceStart}:end=${sourceEnd}`,
    "asetpts=PTS-STARTPTS",
  ];
  if (node.overflow === "loop") {
    video.push(`loop=loop=-1:size=${span}:start=0`);
    const samples = framesToSamples(
      span,
      node.project.metadata.audioSampleRate,
      node.project.canvas.fpsSource,
    );
    audio.push(`aloop=loop=-1:size=${samples}`);
  } else if (node.overflow === "hold" && target > span) {
    const padding = decimal((target - span) / node.project.canvas.fps);
    video.push(`tpad=stop_mode=clone:stop_duration=${padding}`);
    audio.push(`apad=whole_dur=${targetSeconds}`);
  }
  video.push(`trim=end_frame=${target}`, "setpts=PTS-STARTPTS", "format=argb");
  audio.push(`atrim=end=${targetSeconds}`, "asetpts=PTS-STARTPTS");
  return { video: video.join(","), audio: audio.join(",") };
}

async function deriveRenderModuleUnit(
  node: RenderModuleNode,
  rawPath: string,
  contentKey: string,
  unitKey: string,
  options: PrepareRenderModuleOptions,
): Promise<string> {
  if (
    node.inFrame === 0 &&
    node.outFrame === node.rawDurationFrames &&
    node.durationFrames === node.rawDurationFrames &&
    node.overflow === "error"
  ) return rawPath;
  const cacheDirectory = join(
    node.project.rootProjectDir,
    ".render-cache",
    cacheKindDirectory(node),
    contentKey,
    "units",
  );
  const unitDirectory = join(cacheDirectory, unitKey);
  const cachedOutput = await readModuleCache({
    directory: unitDirectory,
    filename: "unit.mov",
    node,
    contentKey,
    unitKey,
    options,
  });
  if (cachedOutput !== undefined) {
    emitDiagnostic(options, {
      phase: "preparing",
      scope: `module/${node.kind}/${node.id}/derived`,
      status: "cache-hit",
      message: "复用模块截取/overflow 缓存",
      details: { output: cachedOutput, unitKey },
    });
    return cachedOutput;
  }
  await mkdir(cacheDirectory, { recursive: true });
  const staging = join(cacheDirectory, `.${unitKey}-${crypto.randomUUID()}.staging`);
  await mkdir(staging, { recursive: true });
  const candidate = join(staging, "unit.mov");
  try {
  const filters = derivedFilters(node);
  const process = Bun.spawn([
    options.ffmpegPath ?? "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    rawPath,
    "-filter_complex",
    `[0:v]${filters.video}[vout];[0:a]${filters.audio}[aout]`,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-frames:v",
    String(node.durationFrames),
    "-c:v",
    "qtrle",
    "-pix_fmt",
    "argb",
    "-c:a",
    "pcm_s16le",
    "-ar",
    String(node.project.metadata.audioSampleRate),
    candidate,
  ], {
    stdout: "ignore",
    stderr: "pipe",
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  emitDiagnostic(options, {
    phase: "preparing",
    scope: `module/${node.kind}/${node.id}/derived-ffmpeg`,
    status: "info",
    message: "已启动模块截取/overflow FFmpeg",
    details: { pid: process.pid, frames: node.durationFrames, candidate },
  });
  const [exitCode, stderr] = await traceOperation(
    options,
    {
      phase: "preparing",
      scope: `module/${node.kind}/${node.id}/derived-ffmpeg`,
      message: "等待模块截取/overflow FFmpeg",
      details: { pid: process.pid },
    },
    () => Promise.all([
      process.exited,
      new Response(process.stderr).text(),
    ]),
  );
  if (exitCode !== 0) {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    fail("RENDER_MODULE_UNIT_FAILED", `${node.kind} "${node.id}" 截取或 overflow 处理失败`, {
      node: node.id,
      exitCode,
      stderr: stderr.trim().slice(-12_000),
    });
  }
  await writeModuleCacheManifest({
    directory: staging,
    filename: "unit.mov",
    node,
    contentKey,
    unitKey,
  });
  try {
    await rename(staging, unitDirectory);
  } catch (error) {
    const winner = await readModuleCache({
      directory: unitDirectory,
      filename: "unit.mov",
      node,
      contentKey,
      unitKey,
      options,
    });
    if (winner !== undefined) {
      await rm(staging, { recursive: true, force: true }).catch(() => {});
      return winner;
    }
    if (existsSync(unitDirectory)) throw error;
    await rename(staging, unitDirectory);
  }
  return join(unitDirectory, "unit.mov");
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

interface PrepareState {
  rawPromises: Map<string, Promise<string>>;
  unitPromises: Map<string, Promise<RenderModuleUnit>>;
  projectPromises: WeakMap<ResolvedProject, Promise<Map<string, RenderModuleUnit>>>;
}

async function prepareProjectRenderModuleUnits(
  project: ResolvedProject,
  options: PrepareRenderModuleOptions,
  state: PrepareState,
): Promise<Map<string, RenderModuleUnit>> {
  const cached = state.projectPromises.get(project);
  if (cached !== undefined) return cached;
  const promise = (async (): Promise<Map<string, RenderModuleUnit>> => {
    const result = new Map<string, RenderModuleUnit>();
    const nodes: RenderModuleNode[] = [
      ...project.sceneNodes,
      ...project.templateNodes,
    ].sort((left, right) => left.declarationOrder - right.declarationOrder);
    for (const node of nodes) {
      if (options.signal?.aborted) fail("RENDER_CANCELLED", "渲染已取消");
      const unit = await traceOperation(
        options,
        {
          phase: "preparing",
          scope: `module/${node.kind}/${node.id}`,
          message: `准备 ${node.kind === "scene" ? "Scene" : "Template"} ${node.id}`,
          details: {
            sourcePath: node.sourcePath,
            frames: node.durationFrames,
            rawFrames: node.rawDurationFrames,
            position: result.size + 1,
            total: nodes.length,
          },
        },
        async (): Promise<RenderModuleUnit> => {
          const childUnits = await prepareProjectRenderModuleUnits(
            node.project,
            options,
            state,
          );
          const contentKey = await traceOperation(
            options,
            {
              phase: "preparing",
              scope: `module/${node.kind}/${node.id}/hash`,
              message: "计算模块内容哈希",
            },
            () => renderModuleContentKey(node, childUnits, options.onDiagnostic),
          );
          const unitKey = unitKeyFor(node, contentKey);
          const unitIdentity = `${node.kind}\0${unitKey}`;
          let unitPromise = state.unitPromises.get(unitIdentity);
          if (unitPromise === undefined) {
            unitPromise = (async (): Promise<RenderModuleUnit> => {
              const rawIdentity = `${node.kind}\0${contentKey}`;
              let rawPromise = state.rawPromises.get(rawIdentity);
              if (rawPromise === undefined) {
                rawPromise = renderRawModule(node, contentKey, options, childUnits);
                state.rawPromises.set(rawIdentity, rawPromise);
              } else {
                emitDiagnostic(options, {
                  phase: "preparing",
                  scope: `module/${node.kind}/${node.id}/raw`,
                  status: "cache-hit",
                  message: "本次渲染中复用相同模块原始视频任务",
                  details: { contentKey },
                });
              }
              const rawPath = await rawPromise;
              const path = await deriveRenderModuleUnit(
                node,
                rawPath,
                contentKey,
                unitKey,
                options,
              );
              return {
                nodeId: node.id,
                moduleKind: node.kind,
                path,
                contentKey,
                unitKey,
              };
            })();
            state.unitPromises.set(unitIdentity, unitPromise);
          } else {
            emitDiagnostic(options, {
              phase: "preparing",
              scope: `module/${node.kind}/${node.id}`,
              status: "cache-hit",
              message: "本次渲染中复用相同模块单元任务",
              details: { unitKey },
            });
          }
          return unitPromise;
        },
      );
      result.set(node.id, { ...unit, nodeId: node.id });
      options.onProgress?.({
        phase: "preparing",
        progress: result.size / Math.max(1, nodes.length),
        totalFrames: project.totalFrames,
        message: `已准备 ${node.kind === "scene" ? "Scene" : "Template"} ${node.id}`,
      });
    }
    return result;
  })();
  state.projectPromises.set(project, promise);
  return promise;
}

export async function prepareRenderModuleUnits(
  project: ResolvedProject,
  options: PrepareRenderModuleOptions,
): Promise<Map<string, RenderModuleUnit>> {
  return prepareProjectRenderModuleUnits(project, options, {
    rawPromises: new Map(),
    unitPromises: new Map(),
    projectPromises: new WeakMap(),
  });
}

export async function prepareSceneUnits(
  project: ResolvedProject,
  options: PrepareSceneOptions,
): Promise<Map<string, SceneRenderUnit>> {
  const units = await prepareRenderModuleUnits(project, options);
  return new Map(
    [...units]
      .filter(([, unit]) => unit.moduleKind === "scene")
      .map(([id, unit]) => [
        id,
        {
          ...unit,
          moduleKind: "scene",
          sceneNodeId: id,
        } satisfies SceneRenderUnit,
      ]),
  );
}
