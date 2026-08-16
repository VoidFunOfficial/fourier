import { existsSync, statSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import React from "react";
import satori from "satori";
import {
  authorRuntimeAliasPlugin,
  isCompilerInjectedReactImport,
  isReactRuntimeImport,
  isSdkAuthorImport,
} from "./author-runtime.ts";
import {
  assertArtifactComponent,
  bindSdkArtifactProps,
  createMotionContext,
  createRenderContext,
  readSdkArtifact,
} from "./artifact-protocol.ts";
import { compileVisualArtifact } from "./artifact-compiler.ts";
import { fail } from "./errors.ts";
import { hashSeed } from "./deterministic.ts";
import {
  imageAssetUrlPlugin,
  imageAssetExtensions,
} from "./image-assets.ts";
import { sampleModifier } from "./modifiers.ts";
import { normalizeOpenTypeFont } from "./open-type-font.ts";
import { emitDiagnostic, traceOperation } from "./render-diagnostics.ts";
import {
  VisualCache,
  VisualContentDigester,
} from "./visual-cache.ts";
import { SampleClock } from "./time.ts";
import {
  effectiveDomPageCount,
  type TimelineInstance,
  type TimelineVideoSurface,
  VisualTimelineRuntime,
} from "./visual-timeline-runtime.ts";
import type { CompiledVisualArtifact } from "./artifact-compiler.ts";
import {
  DOM_RENDER_PROFILE,
  LEGACY_RENDER_PROFILE,
  type RenderProfile,
} from "./render-profile.ts";
import type {
  AudioNode,
  ImageNode,
  MotionContext,
  MotionNode,
  ReactNode,
  RenderContext,
  RenderNode,
  RenderOptions,
  RenderProgress,
  ResolvedProject,
  TextNode,
  VideoNode,
  VisualNode,
} from "./types.ts";

export interface SatoriFont {
  name: string;
  data: ArrayBuffer;
  weight: 400;
  style: "normal";
}

export interface PreparedVisual {
  nodeId: string;
  type: "static" | "sequence" | "media";
  path: string;
  width: number;
  height: number;
  /** Internal content identity used to compose Motion cache keys. */
  cacheKey?: string;
  timelineArtifacts?: readonly PreparedTimelineArtifact[];
  ffmpegVideo?: Readonly<{
    projections: readonly TimelineVideoSurface[];
    /** Per-frame opaque convex quad on black, used to clear perspective spill. */
    maskPath: string;
  }>;
}

export interface PreparedTimelineArtifact {
  readonly nodeId: string;
  readonly kind: "react" | "motion";
  readonly name: string;
  readonly sdkAbiVersion: 1;
  readonly renderer: "dom-timeline" | "dom-timeline-ffmpeg-video";
  readonly snapshotId: string;
  readonly dependencyDigest: string;
  readonly profile: RenderProfile;
}

function timelineArtifactRecord(
  nodeId: string,
  artifact: CompiledVisualArtifact,
): PreparedTimelineArtifact {
  if (
    artifact.sdkAbiVersion !== 1 ||
    !["dom-timeline", "dom-timeline-ffmpeg-video"].includes(artifact.renderer)
  ) {
    fail("ARTIFACT_RUNTIME_MISMATCH", "timeline manifest 只记录 ABI v1 DOM artifact");
  }
  const renderer = artifact.renderer as PreparedTimelineArtifact["renderer"];
  return Object.freeze({
    nodeId,
    kind: artifact.kind,
    name: artifact.name,
    sdkAbiVersion: 1,
    renderer,
    snapshotId: artifact.snapshotId,
    dependencyDigest: artifact.dependencyDigest,
    profile: artifact.renderProfile,
  });
}

interface PreparedTextLayout {
  element: React.ReactNode;
  fonts: SatoriFont[];
  width: number;
  height: number;
}

interface PreparedRasterMotionSubject {
  kind: "raster";
  visual: PreparedVisual;
}

interface PreparedTextMotionSubject {
  kind: "text";
  content: string;
  layout: PreparedTextLayout;
}

type PreparedMotionSubject =
  | PreparedRasterMotionSubject
  | PreparedTextMotionSubject;

type MotionComponent = React.ComponentType<{
  subject: React.ReactNode;
  props: Record<string, unknown>;
  motionContext: MotionContext;
}>;

interface PrepareOptions {
  temporaryDirectory: string;
  ffmpegPath?: string;
  frameConcurrency?: number;
  domPages?: number;
  timelineRuntime?: VisualTimelineRuntime;
  onProgress?: (progress: RenderProgress) => void;
  onDiagnostic?: RenderOptions["onDiagnostic"];
  signal?: AbortSignal;
}

export interface ComponentDescriptor {
  id: string;
  kind?: "react" | "motion";
  component: string;
  componentPath: string;
  exportName: string;
}

const DETERMINISM_VIOLATIONS: Array<[RegExp, string]> = [
  [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/, "网络访问 API"],
  [/\bDate\s*(?:\.|\()/, "系统时间 Date"],
  [/\bperformance\.now\s*\(/, "系统时间 performance.now"],
  [/\bMath\.random\s*\(/, "Math.random"],
  [
    /\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/,
    "浏览器计时器",
  ],
  [/\b(?:Bun|Deno|process)\b/, "运行时全局对象"],
];
const requireComponent = createRequire(import.meta.url);

function verticalJustify(
  value: TextNode["verticalAlign"],
): "flex-start" | "center" | "flex-end" {
  if (value === "top") return "flex-start";
  if (value === "bottom") return "flex-end";
  return "center";
}

export async function rasterizeReact(
  element: React.ReactNode,
  width: number,
  height: number,
  fonts: SatoriFont[],
): Promise<Uint8Array> {
  let svg: string;
  try {
    svg = await satori(element, {
      width,
      height,
      fonts,
    });
  } catch (error) {
    fail(
      "VISUAL_RENDER_FAILED",
      `无法生成 SVG: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return new Resvg(svg, {
      fitTo: { mode: "original" },
    })
      .render()
      .asPng();
  } catch (error) {
    fail(
      "VISUAL_RENDER_FAILED",
      `无法栅格化 SVG: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function prepareTextLayout(
  node: TextNode,
  maximumWidth: number,
): Promise<PreparedTextLayout> {
  let fontData: ArrayBuffer;
  try {
    fontData = normalizeOpenTypeFont(
      await Bun.file(node.fontPath).arrayBuffer(),
    );
  } catch (error) {
    fail(
      "VISUAL_RENDER_FAILED",
      `无法加载 ${node.kind} "${node.id}" 的 OpenType 字体: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { node: node.id, font: node.font },
    );
  }
  const fontName = `ProjectFont-${node.id}`;
  const fonts: SatoriFont[] = [
    {
      name: fontName,
      data: fontData,
      weight: 400,
      style: "normal",
    },
  ];
  const textStyle: Record<string, unknown> = {
    width: "100%",
    color: node.color,
    fontFamily: fontName,
    fontSize: node.fontSize,
    lineHeight: node.lineHeight,
    textAlign: node.align,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    overflow: "hidden",
    textOverflow: node.overflow === "ellipsis" ? "ellipsis" : "clip",
    ...(node.maxLines === undefined ? {} : { lineClamp: node.maxLines }),
  };
  const content = React.createElement(
    "div",
    { style: textStyle },
    node.content,
  );
  const containerStyle = (
    width?: number,
    height?: number,
  ): Record<string, unknown> => ({
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    display: "flex",
    flexDirection: "column",
    ...(height === undefined
      ? {}
      : { justifyContent: verticalJustify(node.verticalAlign) }),
    overflow: "hidden",
    ...(node.background === undefined
      ? {}
      : { background: node.background }),
  });
  const measure = async (
    width?: number,
  ): Promise<{ width: number; height: number }> => {
    let root: { width: number; height: number } | undefined;
    await satori(
      React.createElement(
        "div",
        { style: containerStyle(width) },
        content,
      ),
      {
        ...(width === undefined
          ? { height: Math.max(1, node.height) }
          : { width }),
        fonts,
        onNodeDetected(detected) {
          root ??= { width: detected.width, height: detected.height };
        },
      },
    );
    if (root === undefined) {
      fail(
        "VISUAL_RENDER_FAILED",
        `无法测量 ${node.kind} "${node.id}" 的文本尺寸`,
        { node: node.id },
      );
    }
    return root;
  };

  const measuredWidth = node.autoWidth
    ? Math.ceil((await measure()).width)
    : node.width;
  const resolvedWidth = node.autoWidth
    ? Math.max(1, Math.min(maximumWidth, measuredWidth))
    : measuredWidth;
  const measuredHeight = Math.ceil((await measure(resolvedWidth)).height);
  const resolvedHeight = Math.max(1, node.height, measuredHeight);

  const element = React.createElement(
    "div",
    { style: containerStyle(resolvedWidth, resolvedHeight) },
    content,
  );
  return {
    element,
    fonts,
    width: resolvedWidth,
    height: resolvedHeight,
  };
}

async function renderTextNode(
  node: TextNode,
  outputPath: string,
  maximumWidth: number,
): Promise<{ width: number; height: number }> {
  const prepared = await prepareTextLayout(node, maximumWidth);
  await Bun.write(
    outputPath,
    await rasterizeReact(
      prepared.element,
      prepared.width,
      prepared.height,
      prepared.fonts,
    ),
  );
  return { width: prepared.width, height: prepared.height };
}

export async function resolveProjectTextLayouts(
  project: ResolvedProject,
): Promise<void> {
  const visited = new WeakSet<ResolvedProject>();
  const resolveProject = async (current: ResolvedProject): Promise<void> => {
    if (visited.has(current)) return;
    visited.add(current);
    for (const node of current.nodes) {
      if (node.kind !== "text" && node.kind !== "subtitle") continue;
      const layout = await prepareTextLayout(node, current.canvas.width);
      node.width = layout.width;
      node.height = layout.height;
    }
    for (const moduleNode of [
      ...current.sceneNodes,
      ...current.templateNodes,
    ]) {
      await resolveProject(moduleNode.project);
    }
  };
  await resolveProject(project);
}

async function findProjectFonts(projectRoots: readonly string[]): Promise<string[]> {
  const byName = new Map<string, string>();
  for (const projectRoot of projectRoots) {
    const fontsDirectory = join(projectRoot, "fonts");
    try {
      const entries = await readdir(fontsDirectory, {
        recursive: true,
        withFileTypes: true,
      });
      for (const entry of entries) {
        if (
          !entry.isFile() ||
          ![".ttf", ".otf"].includes(extname(entry.name).toLowerCase())
        ) continue;
        const name = basename(entry.name, extname(entry.name));
        if (!byName.has(name)) byName.set(name, join(entry.parentPath, entry.name));
      }
    } catch {
      // A scope without a fonts directory contributes no fonts.
    }
  }
  return [...byName.values()].sort();
}

export async function loadProjectFonts(
  projectDirOrRoots: string | readonly string[],
): Promise<SatoriFont[]> {
  const roots = typeof projectDirOrRoots === "string"
    ? [projectDirOrRoots]
    : projectDirOrRoots;
  const paths = await findProjectFonts(roots);
  const fonts = await Promise.all(
    paths.map(async (path) => ({
      name: basename(path, extname(path)),
      data: await Bun.file(path).arrayBuffer(),
      weight: 400 as const,
      style: "normal" as const,
    })),
  );
  if (fonts[0] !== undefined) {
    fonts.push({
      name: "RenderEngineFallback",
      data: fonts[0].data.slice(0),
      weight: 400,
      style: "normal",
    });
  }
  return fonts;
}

export async function loadProjectFontSources(
  projectDirOrRoots: string | readonly string[],
): Promise<Array<{ family: string; source: string }>> {
  const roots = typeof projectDirOrRoots === "string"
    ? [projectDirOrRoots]
    : projectDirOrRoots;
  return (await findProjectFonts(roots)).map((source) => ({
    family: basename(source, extname(source)),
    source,
  }));
}

function validateDeterministicSource(
  node: ComponentDescriptor,
  source: string,
): void {
  for (const [pattern, label] of DETERMINISM_VIOLATIONS) {
    if (pattern.test(source)) {
      fail(
        "NON_DETERMINISTIC_COMPONENT",
        `React 组件 "${node.component}" 使用了禁止的 ${label}`,
        { node: node.id, component: node.component, violation: label },
      );
    }
  }
}

function resolveLocalImport(importer: string, specifier: string): string {
  const base = resolve(dirname(importer), specifier);
  const extension = extname(base).toLowerCase();
  const sourceBase = extension === "" ? base : base.slice(0, -extension.length);
  const sourceSubstitutions = extension === ".js"
    ? [`${sourceBase}.ts`, `${sourceBase}.tsx`]
    : extension === ".jsx"
      ? [`${sourceBase}.tsx`]
      : extension === ".mjs"
        ? [`${sourceBase}.mts`]
        : extension === ".cjs"
          ? [`${sourceBase}.cts`]
          : [];
  const candidates = [
    base,
    ...sourceSubstitutions,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.css`,
    `${base}.json`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    join(base, "index.js"),
    join(base, "index.jsx"),
  ];
  const found = candidates.find(
    (path) => existsSync(path) && statSync(path).isFile(),
  );
  if (found === undefined) {
    fail(
      "COMPONENT_IMPORT_NOT_FOUND",
      `React 组件依赖不存在: "${specifier}"`,
      { importer, specifier },
    );
  }
  return found;
}

const componentBinaryAssetExtensions = new Set([
  ...imageAssetExtensions,
  ".otf",
  ".ttf",
  ".woff",
  ".woff2",
]);

function isWithinRoot(path: string, root: string): boolean {
  const pathFromRoot = relative(root, path);
  return pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`);
}

export async function collectComponentDependencies(
  node: ComponentDescriptor,
  projectRoots: readonly string[],
): Promise<string[]> {
  const visited = new Set<string>();
  if (!projectRoots.some((root) => isWithinRoot(node.componentPath, root))) {
    fail(
      "INVALID_COMPONENT_IMPORT",
      `React 组件不在允许的资源作用域内: "${node.componentPath}"`,
      { node: node.id, path: node.componentPath },
    );
  }
  const visit = async (path: string): Promise<void> => {
    if (visited.has(path)) return;
    visited.add(path);
    if (!projectRoots.some((root) => isWithinRoot(path, root))) {
      fail(
        "INVALID_COMPONENT_IMPORT",
        `React 组件依赖必须位于允许的模块目录内: "${path}"`,
        { node: node.id, path },
      );
    }
    const extension = extname(path).toLowerCase();
    if (
      extension === ".css" ||
      extension === ".json" ||
      componentBinaryAssetExtensions.has(extension)
    ) return;
    const source = await Bun.file(path).text();
    validateDeterministicSource(node, source);
    const loader =
      extension === ".ts" || extension === ".mts" || extension === ".cts"
        ? "ts"
        : extension === ".js" ||
            extension === ".mjs" ||
            extension === ".cjs"
          ? "js"
          : extension === ".jsx"
            ? "jsx"
            : "tsx";
    const imports = new Bun.Transpiler({ loader }).scanImports(source);
    for (const dependency of imports) {
      if (isCompilerInjectedReactImport(dependency) || isSdkAuthorImport(dependency.path)) {
        continue;
      }
      if (isReactRuntimeImport(dependency.path)) {
        fail(
          "INVALID_COMPONENT_IMPORT",
          `React 组件必须从 @fourier-video/sdk 导入 React 能力，禁止直接导入 "${dependency.path}"`,
          { node: node.id, importer: path, specifier: dependency.path },
        );
      }
      if (!dependency.path.startsWith(".")) {
        fail(
          "INVALID_COMPONENT_IMPORT",
          `React 组件只允许导入工程内相对模块和 @fourier-video/sdk，收到 "${dependency.path}"`,
          {
            node: node.id,
            importer: path,
            specifier: dependency.path,
          },
        );
      }
      await visit(resolveLocalImport(path, dependency.path));
    }
  };
  await visit(node.componentPath);
  return [...visited].sort();
}

export async function bundleReactModule(
  node: ComponentDescriptor,
  bundleDirectory: string,
  projectDirOrRoots: string | readonly string[],
): Promise<Record<string, unknown>> {
  const projectRoots = typeof projectDirOrRoots === "string"
    ? [projectDirOrRoots]
    : projectDirOrRoots;
  await collectComponentDependencies(node, projectRoots);
  const forbiddenModule = /^(?:node:|bun:|fs$|fs\/|child_process$|net$|tls$|http$|https$|dgram$)/;
  const result = await Bun.build({
    entrypoints: [node.componentPath],
    outdir: bundleDirectory,
    target: "bun",
    format: "cjs",
    splitting: false,
    sourcemap: "none",
    minify: false,
    plugins: [
      imageAssetUrlPlugin("render-engine-component-images"),
      {
        name: "render-engine-component-policy",
        setup(builder) {
          builder.onResolve({ filter: forbiddenModule }, (args) => {
            throw new Error(`React 组件禁止导入模块 "${args.path}"`);
          });
        },
      },
      authorRuntimeAliasPlugin("fourier-component-author-runtime"),
    ],
  });
  if (!result.success || result.outputs[0] === undefined) {
    const messages = result.logs.map((log) => log.message).join("\n");
    fail(
      "COMPONENT_BUILD_FAILED",
      `无法编译 React 组件 "${node.component}": ${messages}`,
      { node: node.id, component: node.component },
    );
  }
  const output = result.outputs[0];
  const outputBytes = await output.arrayBuffer();
  const modulePath = join(
    bundleDirectory,
    `${node.id.replaceAll(/[^A-Za-z0-9_-]/g, "_")}-${basename(output.path)}`,
  );
  await Bun.write(modulePath, outputBytes);
  let imported: Record<string, unknown>;
  try {
    imported = requireComponent(modulePath) as Record<string, unknown>;
  } catch (error) {
    fail(
      "COMPONENT_LOAD_FAILED",
      `无法加载 React 组件 "${node.component}": ${error instanceof Error ? error.message : String(error)}`,
      { node: node.id, component: node.component },
    );
  }
  return imported;
}

async function bundleReactComponent(
  node: ComponentDescriptor,
  bundleDirectory: string,
  projectDirOrRoots: string | readonly string[],
): Promise<unknown> {
  const imported = await bundleReactModule(
    node,
    bundleDirectory,
    projectDirOrRoots,
  );
  const component = imported[node.exportName];
  return assertArtifactComponent(
    component,
    node.kind === "motion" ? "motion" : "react",
    `React 组件 "${node.component}" 的导出 "${node.exportName}"`,
  );
}

async function runPool(
  count: number,
  concurrency: number,
  task: (index: number, workerIndex: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(count, Math.max(1, concurrency)) },
    async (_, workerIndex) => {
      while (true) {
        if (signal?.aborted) fail("RENDER_CANCELLED", "渲染已取消");
        const index = cursor++;
        if (index >= count) return;
        await task(index, workerIndex);
      }
    },
  );
  await Promise.all(workers);
}

async function openTimelineInstances(
  runtime: VisualTimelineRuntime,
  artifact: CompiledVisualArtifact,
  count: number,
): Promise<readonly TimelineInstance[]> {
  const settled = await Promise.allSettled(
    Array.from({ length: count }, () => runtime.open(artifact)),
  );
  const instances: TimelineInstance[] = [];
  let failure: unknown;
  for (const result of settled) {
    if (result.status === "fulfilled") {
      instances.push(result.value);
    } else if (failure === undefined) {
      failure = result.reason;
    }
  }
  if (failure !== undefined) {
    await Promise.allSettled(instances.map((instance) => instance.close()));
    throw failure;
  }
  return instances;
}

async function openTimelineInstancesForArtifact(
  runtime: VisualTimelineRuntime,
  artifact: CompiledVisualArtifact,
  maximumCount: number,
): Promise<readonly TimelineInstance[]> {
  const first = await runtime.open(artifact);
  if (first.isStatic || maximumCount === 1) return [first];
  try {
    const remaining = await openTimelineInstances(
      runtime,
      artifact,
      maximumCount - 1,
    );
    return [first, ...remaining];
  } catch (error) {
    await first.close().catch(() => undefined);
    throw error;
  }
}

function frameFileName(frame: number): string {
  return `${frame.toString().padStart(8, "0")}.png`;
}

interface RenderedReactNode {
  readonly timelineArtifact?: PreparedTimelineArtifact;
  readonly staticPath?: string;
}

type RenderProgressReporter = (
  count?: number,
  mode?: "frames" | "static",
) => void;

async function renderReactNode(
  project: ResolvedProject,
  node: ReactNode,
  outputDirectory: string,
  bundleDirectory: string,
  fonts: SatoriFont[],
  concurrency: number,
  domPages: number | undefined,
  runtime: VisualTimelineRuntime,
  onFrame: RenderProgressReporter,
  signal?: AbortSignal,
  onDiagnostic?: RenderOptions["onDiagnostic"],
): Promise<RenderedReactNode> {
  const diagnosticTarget = {
    ...(onDiagnostic === undefined ? {} : { onDiagnostic }),
  };
  const scope = `visual/react/${node.id}`;
  const component = await traceOperation(
    diagnosticTarget,
    {
      phase: "preparing",
      scope: `${scope}/bundle`,
      message: `编译并加载 React 组件 ${node.component}`,
      details: { componentPath: node.componentPath, exportName: node.exportName },
    },
    () => bundleReactComponent(
      node,
      bundleDirectory,
      project.resourceRoots,
    ),
  );
  const props = bindSdkArtifactProps(component, node.props, {
    fps: project.canvas.fps,
    ...(node.propTypes === undefined ? {} : { declarations: node.propTypes }),
  });
  const seed = hashSeed(`${project.metadata.id}:${node.id}`);
  const metadata = readSdkArtifact(component, "react");
  if (metadata?.sdkAbiVersion === 1) {
    if (node.exportName !== "default") {
      fail("ARTIFACT_EXPORT_INVALID", "SDK ABI v1 React production entry 必须是 default export");
    }
    const compiled = await traceOperation(
      diagnosticTarget,
      {
        phase: "preparing",
        scope: `${scope}/compile`,
        message: "编译 DOM Timeline artifact",
        details: { frames: node.durationFrames },
      },
      async () => compileVisualArtifact({
        entryPath: node.componentPath,
        props,
        composition: {
          width: node.width,
          height: node.height,
          fps: project.canvas.fps,
          fpsSource: project.canvas.fpsSource,
          durationInFrames: node.durationFrames,
        },
        fonts: await loadProjectFontSources(project.resourceRoots),
        seed,
      }),
    );
    const pageCount = metadata.static === true
      ? 1
      : Math.min(
          node.durationFrames,
          concurrency,
          effectiveDomPageCount(domPages),
        );
    const instances = await traceOperation(
      diagnosticTarget,
      {
        phase: "preparing",
        scope: `${scope}/pages`,
        message: `启动最多 ${pageCount} 个 DOM Timeline page`,
        details: {
          maximumPageCount: pageCount,
          declaredStatic: metadata.static === true,
        },
      },
      () => openTimelineInstancesForArtifact(runtime, compiled, pageCount),
    );
    const clock = new SampleClock(project.canvas.fpsSource);
    try {
      const first = instances[0];
      if (first === undefined) fail("INTERNAL_ERROR", "DOM page worker 不存在");
      if (first.isStatic) {
        const result = await first.sample({
          time: clock.frameStart(0),
          ...(signal === undefined ? {} : { signal }),
        });
        const staticPath = join(outputDirectory, "static.png");
        await Bun.write(staticPath, result.png);
        onFrame(node.durationFrames, "static");
        return {
          timelineArtifact: timelineArtifactRecord(node.id, compiled),
          staticPath,
        };
      }
      await runPool(node.durationFrames, instances.length, async (localFrame, workerIndex) => {
        const instance = instances[workerIndex];
        if (instance === undefined) fail("INTERNAL_ERROR", "DOM page worker 不存在");
        const result = await instance.sample({
          time: clock.frameStart(localFrame),
          ...(signal === undefined ? {} : { signal }),
        });
        await Bun.write(join(outputDirectory, frameFileName(localFrame)), result.png);
        onFrame();
      }, signal);
      return { timelineArtifact: timelineArtifactRecord(node.id, compiled) };
    } finally {
      await Promise.allSettled(instances.map((instance) => instance.close()));
    }
  }
  await runPool(node.durationFrames, concurrency, async (localFrame) => {
    const frame = node.startFrame + localFrame;
    const renderContext = createRenderContext({
      frame,
      localFrame,
      fps: project.canvas.fps,
      width: node.width,
      height: node.height,
      seed,
    });
    const element = React.createElement(
      component as React.ElementType,
      {
        ...props,
        renderContext,
      },
    );
    const png = await rasterizeReact(element, node.width, node.height, fonts);
    await Bun.write(join(outputDirectory, frameFileName(localFrame)), png);
    onFrame();
  }, signal);
  return {};
}

function sourceFramePath(
  prepared: PreparedVisual,
  localFrame: number,
): string {
  if (prepared.type === "static") return prepared.path;
  if (prepared.type === "media") {
    fail("INTERNAL_ERROR", `缓存媒体 ${prepared.nodeId} 不能作为逐帧 Motion subject`);
  }
  return prepared.path.replace("%08d", localFrame.toString().padStart(8, "0"));
}

function motionSubjectSize(
  subject: PreparedMotionSubject,
): { width: number; height: number } {
  return subject.kind === "text"
    ? { width: subject.layout.width, height: subject.layout.height }
    : { width: subject.visual.width, height: subject.visual.height };
}

export async function pngDataUri(path: string): Promise<string> {
  const bytes = await Bun.file(path).arrayBuffer();
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

async function renderImageSubject(
  node: ImageNode,
  outputPath: string,
): Promise<void> {
  const bytes = await Bun.file(node.sourcePath).arrayBuffer();
  const extension = extname(node.sourcePath).toLowerCase();
  const mediaType =
    extension === ".jpg" || extension === ".jpeg"
      ? "image/jpeg"
      : extension === ".webp"
        ? "image/webp"
        : "image/png";
  const uri = `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
  const element = React.createElement("img", {
    src: uri,
    width: node.width,
    height: node.height,
    style: {
      width: node.width,
      height: node.height,
      objectFit: node.fit === "stretch" ? "fill" : node.fit,
    },
  });
  await Bun.write(
    outputPath,
    await rasterizeReact(element, node.width, node.height, []),
  );
}

function videoFitFilters(node: VideoNode): string[] {
  if (node.fit === "stretch") {
    return [`scale=${node.width}:${node.height}`];
  }
  if (node.fit === "cover") {
    return [
      `scale=${node.width}:${node.height}:force_original_aspect_ratio=increase`,
      `crop=${node.width}:${node.height}`,
    ];
  }
  return [
    `scale=${node.width}:${node.height}:force_original_aspect_ratio=decrease`,
    `pad=${node.width}:${node.height}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
  ];
}

async function renderVideoSubjects(
  project: ResolvedProject,
  node: VideoNode,
  outputDirectory: string,
  ffmpegPath: string,
): Promise<void> {
  const filters = [
    `trim=start=${node.inFrame / project.canvas.fps}:duration=${
      (node.durationFrames / project.canvas.fps) * node.rate
    }`,
    `setpts=(PTS-STARTPTS)/${node.rate}`,
    `fps=${project.canvas.fpsSource}`,
    `trim=end_frame=${node.durationFrames}`,
    "setpts=PTS-STARTPTS",
    "format=rgba",
    ...videoFitFilters(node),
  ].join(",");
  const process = Bun.spawn(
    [
      ffmpegPath,
      "-hide_banner",
      "-loglevel",
      "error",
      ...(node.loop ? ["-stream_loop", "-1"] : []),
      "-i",
      node.sourcePath,
      "-vf",
      filters,
      "-frames:v",
      String(node.durationFrames),
      "-start_number",
      "0",
      join(outputDirectory, "%08d.png"),
    ],
    { stdout: "ignore", stderr: "pipe" },
  );
  const [exitCode, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    fail(
      "VISUAL_RENDER_FAILED",
      `无法为 Motion 提取视频宿主 "${node.id}": ${stderr}`,
    );
  }
}

async function renderVideoSubjectFrame(
  project: ResolvedProject,
  node: VideoNode,
  localFrame: number,
  outputPath: string,
  ffmpegPath: string,
): Promise<void> {
  const sourceSeconds =
    (node.inFrame + localFrame * node.rate) / project.canvas.fps;
  const process = Bun.spawn(
    [
      ffmpegPath,
      "-hide_banner",
      "-loglevel",
      "error",
      ...(node.loop ? ["-stream_loop", "-1"] : []),
      "-i",
      node.sourcePath,
      "-ss",
      String(sourceSeconds),
      "-vf",
      ["format=rgba", ...videoFitFilters(node)].join(","),
      "-frames:v",
      "1",
      "-y",
      outputPath,
    ],
    { stdout: "ignore", stderr: "pipe" },
  );
  const [exitCode, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    fail(
      "VISUAL_RENDER_FAILED",
      `无法提取视频宿主 "${node.id}" 的 ${localFrame}f: ${stderr}`,
    );
  }
}

function sparseRoundedAlpha(
  ratio: number,
  width: number,
  height: number,
): string {
  const radius = ratio * Math.min(width, height);
  if (radius <= 0) return "alpha(X,Y)";
  const value = Number(radius.toFixed(12)).toString();
  const right = Number((width - radius - 1).toFixed(12)).toString();
  const bottom = Number((height - radius - 1).toFixed(12)).toString();
  const nearestX = `if(lt(X,${value}),${value},${right})`;
  const nearestY = `if(lt(Y,${value}),${value},${bottom})`;
  return `alpha(X,Y)*(if(between(X,${value},${right}),1,` +
    `if(between(Y,${value},${bottom}),1,` +
    `lte(pow(X-(${nearestX}),2)+pow(Y-(${nearestY}),2),pow(${value},2)))))`;
}

async function renderSparseFfmpegVideoMotion(
  project: ResolvedProject,
  node: VideoNode,
  motion: MotionNode,
  component: unknown,
  localFrame: number,
  outputPath: string,
  ffmpegPath: string,
  domPages?: number,
): Promise<void> {
  if (sampleModifier(motion, localFrame) === undefined) {
    await renderVideoSubjectFrame(
      project,
      node,
      localFrame,
      outputPath,
      ffmpegPath,
    );
    return;
  }
  const metadata = readSdkArtifact(component, "motion");
  if (
    metadata?.sdkAbiVersion !== 1 ||
    metadata.renderer !== "dom-timeline-ffmpeg-video"
  ) {
    fail("ARTIFACT_RUNTIME_MISMATCH", `Motion "${motion.id}" 不是 FFmpeg Video Motion`);
  }
  const props = bindSdkArtifactProps(component, motion.props, {
    fps: project.canvas.fps,
    ...(motion.propTypes === undefined ? {} : { declarations: motion.propTypes }),
  });
  const compiled = await compileVisualArtifact({
    entryPath: motion.componentPath,
    props,
    composition: {
      width: node.width,
      height: node.height,
      fps: project.canvas.fps,
      fpsSource: project.canvas.fpsSource,
      durationInFrames: node.durationFrames,
    },
    fonts: await loadProjectFontSources(project.resourceRoots),
    seed: hashSeed(`${project.metadata.id}:${motion.id}`),
    motion: {
      startFrame: motion.localStartFrame,
      durationInFrames: motion.durationFrames,
      fill: motion.fill,
    },
  });
  const runtime = new VisualTimelineRuntime({ maximumDomPages: domPages ?? 1 });
  const panelPath = `${outputPath}.panel.png`;
  const maskPath = `${outputPath}.video-mask.png`;
  try {
    const instance = await runtime.open(compiled);
    try {
      const result = await instance.sample({
        time: new SampleClock(project.canvas.fpsSource).frameStart(localFrame),
      });
      if (
        result.videoSurfaces.length !== 1 ||
        result.videoSurfaces[0]?.videoId !== "subject"
      ) {
        fail(
          result.videoSurfaces.length === 0
            ? "VIDEO_SURFACE_REQUIRED"
            : "VIDEO_SURFACE_MULTIPLE",
          `FFmpeg Video Motion "${metadata.name}" 必须输出一个 subject surface`,
        );
      }
      const surface = result.videoSurfaces[0];
      await Promise.all([
        Bun.write(panelPath, result.png),
        Bun.write(maskPath, videoSurfaceMaskPng(surface, node.width, node.height)),
      ]);
      const sourceSeconds =
        (node.inFrame + localFrame * node.rate) / project.canvas.fps;
      const [topLeft, topRight, bottomLeft, bottomRight] = surface.corners;
      const perspective = [
        `x0=${topLeft.x}`, `y0=${topLeft.y}`,
        `x1=${topRight.x}`, `y1=${topRight.y}`,
        `x2=${bottomLeft.x}`, `y2=${bottomLeft.y}`,
        `x3=${bottomRight.x}`, `y3=${bottomRight.y}`,
        "interpolation=cubic", "sense=destination", "eval=init",
      ].join(":");
      const filters = [
        `[0:v]trim=start=${sourceSeconds}:duration=${1 / project.canvas.fps},` +
          `setpts=PTS-STARTPTS,format=rgba,${videoFitFilters(node).join(",")},` +
          `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
          `a='${sparseRoundedAlpha(surface.cornerRadiusRatio, node.width, node.height)}',` +
          `perspective=${perspective},split=2[video_color_source][video_alpha_source]`,
        "[video_color_source]format=rgb24[video_color]",
        "[video_alpha_source]alphaextract[video_alpha]",
        `[2:v]format=gray,scale=${node.width}:${node.height}[video_quad_mask]`,
        "[video_alpha][video_quad_mask]blend=all_mode=multiply[video_clipped_alpha]",
        "[video_color][video_clipped_alpha]alphamerge[video]",
        `[1:v]format=rgba,scale=${node.width}:${node.height}[panel]`,
        "[panel][video]overlay=x=0:y=0:shortest=1[out]",
      ].join(";");
      const process = Bun.spawn([
        ffmpegPath,
        "-hide_banner", "-loglevel", "error", "-y",
        ...(node.loop ? ["-stream_loop", "-1"] : []),
        "-i", node.sourcePath,
        "-i", panelPath,
        "-i", maskPath,
        "-filter_complex", filters,
        "-map", "[out]", "-frames:v", "1", outputPath,
      ], { stdout: "ignore", stderr: "pipe" });
      const [exitCode, stderr] = await Promise.all([
        process.exited,
        new Response(process.stderr).text(),
      ]);
      if (exitCode !== 0) {
        fail("FFMPEG_FAILED", `FFmpeg Video Motion 稀疏预览失败: ${stderr}`);
      }
    } finally {
      await instance.close();
    }
  } finally {
    await runtime.close();
    await Promise.all([
      rm(panelPath, { force: true }).catch(() => undefined),
      rm(maskPath, { force: true }).catch(() => undefined),
    ]);
  }
}

async function renderReactFrame(
  project: ResolvedProject,
  node: ReactNode,
  localFrame: number,
  outputPath: string,
  bundleDirectory: string,
  fonts: SatoriFont[],
  domPages?: number,
): Promise<void> {
  const component = await bundleReactComponent(
    node,
    bundleDirectory,
    project.resourceRoots,
  );
  const props = bindSdkArtifactProps(component, node.props, {
    fps: project.canvas.fps,
    ...(node.propTypes === undefined ? {} : { declarations: node.propTypes }),
  });
  const metadata = readSdkArtifact(component, "react");
  if (metadata?.sdkAbiVersion === 1) {
    if (node.exportName !== "default") {
      fail("ARTIFACT_EXPORT_INVALID", "SDK ABI v1 React preview entry 必须是 default export");
    }
    const runtime = new VisualTimelineRuntime({
      maximumDomPages: effectiveDomPageCount(domPages ?? 1),
    });
    try {
      const compiled = await compileVisualArtifact({
        entryPath: node.componentPath,
        props,
        composition: {
          width: node.width,
          height: node.height,
          fps: project.canvas.fps,
          fpsSource: project.canvas.fpsSource,
          durationInFrames: node.durationFrames,
        },
        fonts: await loadProjectFontSources(project.resourceRoots),
        seed: hashSeed(`${project.metadata.id}:${node.id}`),
      });
      const [instance] = await openTimelineInstances(runtime, compiled, 1);
      if (instance === undefined) fail("INTERNAL_ERROR", "DOM preview page worker 不存在");
      try {
        const result = await instance.sample({
          time: new SampleClock(project.canvas.fpsSource).frameStart(localFrame),
        });
        await Bun.write(outputPath, result.png);
      } finally {
        await instance.close();
      }
    } finally {
      await runtime.close();
    }
    return;
  }
  const frame = node.startFrame + localFrame;
  const renderContext = createRenderContext({
    frame,
    localFrame,
    fps: project.canvas.fps,
    width: node.width,
    height: node.height,
    seed: hashSeed(`${project.metadata.id}:${node.id}`),
  });
  const element = React.createElement(component as React.ElementType, {
    ...props,
    renderContext,
  });
  await Bun.write(
    outputPath,
    await rasterizeReact(element, node.width, node.height, fonts),
  );
}

async function renderUnmodifiedMotionSubject(
  subject: PreparedMotionSubject,
  hostFrame: number,
  outputPath: string,
): Promise<void> {
  if (subject.kind === "raster") {
    await Bun.write(
      outputPath,
      Bun.file(sourceFramePath(subject.visual, hostFrame)),
    );
    return;
  }
  await Bun.write(
    outputPath,
    await rasterizeReact(
      subject.layout.element,
      subject.layout.width,
      subject.layout.height,
      subject.layout.fonts,
    ),
  );
}

async function preparedSubjectPng(
  subject: PreparedMotionSubject,
  hostFrame: number,
): Promise<Uint8Array> {
  if (subject.kind === "raster") {
    return new Uint8Array(
      await Bun.file(sourceFramePath(subject.visual, hostFrame)).arrayBuffer(),
    );
  }
  return rasterizeReact(
    subject.layout.element,
    subject.layout.width,
    subject.layout.height,
    subject.layout.fonts,
  );
}

async function renderDomMotionSamples(
  project: ResolvedProject,
  node: VisualNode,
  motion: MotionNode,
  subject: PreparedMotionSubject,
  component: unknown,
  frames: readonly number[],
  outputPath: (hostFrame: number) => string,
  onFrame: () => void,
  concurrency = 1,
  domPages?: number,
  signal?: AbortSignal,
  sharedRuntime?: VisualTimelineRuntime,
  onDiagnostic?: RenderOptions["onDiagnostic"],
): Promise<PreparedTimelineArtifact | undefined> {
  const metadata = readSdkArtifact(component, "motion");
  if (metadata?.sdkAbiVersion !== 1) return undefined;
  if (subject.kind === "text" && !metadata.supportsTextMotion) {
    fail(
      "TEXT_MOTION_UNSUPPORTED",
      `Motion "${metadata.name}" 不支持 Text 宿主`,
      { artifact: metadata.name, motionId: motion.id, hostId: node.id },
    );
  }
  if (motion.exportName !== "default") {
    fail("ARTIFACT_EXPORT_INVALID", "SDK ABI v1 Motion production entry 必须是 default export");
  }
  const { width, height } = motionSubjectSize(subject);
  const props = bindSdkArtifactProps(component, motion.props, {
    fps: project.canvas.fps,
    ...(motion.propTypes === undefined ? {} : { declarations: motion.propTypes }),
  });
  const seed = hashSeed(`${project.metadata.id}:${motion.id}`);
  const clock = new SampleClock(project.canvas.fpsSource);
  const provider = async (
    time: { numerator: bigint; denominator: bigint },
    providerSignal?: AbortSignal,
  ) => {
    if (providerSignal?.aborted) fail("RENDER_CANCELLED", "Motion subject 已取消");
    const hostFrame = clock.frameAt(time);
    const png = await preparedSubjectPng(subject, hostFrame);
    const digest = createHash("sha256").update(png).digest("hex");
    return {
      png,
      digest,
      dataUrl: `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
    };
  };
  const diagnosticTarget = {
    ...(onDiagnostic === undefined ? {} : { onDiagnostic }),
  };
  const scope = `visual/motion/${motion.id}`;
  const compiled = await traceOperation(
    diagnosticTarget,
    {
      phase: "preparing",
      scope: `${scope}/compile`,
      message: "编译 Motion DOM Timeline artifact",
      details: { host: node.id, frames: frames.length },
    },
    async () => compileVisualArtifact({
      entryPath: motion.componentPath,
      props,
      composition: {
        width,
        height,
        fps: project.canvas.fps,
        fpsSource: project.canvas.fpsSource,
        durationInFrames: node.durationFrames,
      },
      fonts: await loadProjectFontSources(project.resourceRoots),
      seed,
      motion: {
        startFrame: motion.localStartFrame,
        durationInFrames: motion.durationFrames,
        fill: motion.fill,
      },
      ...(subject.kind === "text" ? { textSubject: subject.content } : {}),
      dynamicSubjectProvider: provider,
    }),
  );
  const pageCount = Math.min(
    frames.length,
    concurrency,
    effectiveDomPageCount(domPages),
  );
  const ownsRuntime = sharedRuntime === undefined;
  const runtime = sharedRuntime ?? new VisualTimelineRuntime({ maximumDomPages: pageCount });
  try {
    const instances = await traceOperation(
      diagnosticTarget,
      {
        phase: "preparing",
        scope: `${scope}/pages`,
        message: `启动 ${pageCount} 个 Motion DOM Timeline page`,
        details: { pageCount, host: node.id },
      },
      () => openTimelineInstances(runtime, compiled, pageCount),
    );
    try {
      await runPool(frames.length, pageCount, async (index, workerIndex) => {
        const hostFrame = frames[index];
        const instance = instances[workerIndex];
        if (hostFrame === undefined || instance === undefined) {
          fail("INTERNAL_ERROR", "DOM Motion page worker 不存在");
        }
        if (signal?.aborted) fail("RENDER_CANCELLED", "Motion 渲染已取消");
        const result = await instance.sample({
          time: clock.frameStart(hostFrame),
          ...(signal === undefined ? {} : { signal }),
        });
        await Bun.write(outputPath(hostFrame), result.png);
        onFrame();
      }, signal);
    } finally {
      await Promise.allSettled(instances.map((instance) => instance.close()));
    }
  } finally {
    if (ownsRuntime) await runtime.close();
  }
  return timelineArtifactRecord(motion.id, compiled);
}

async function renderMotionFrame(
  project: ResolvedProject,
  node: VisualNode,
  motion: MotionNode,
  subject: PreparedMotionSubject,
  component: MotionComponent,
  fonts: SatoriFont[],
  seed: number,
  hostFrame: number,
  outputPath: string,
): Promise<void> {
  const sample = sampleModifier(motion, hostFrame);
  if (sample === undefined) {
    await renderUnmodifiedMotionSubject(subject, hostFrame, outputPath);
    return;
  }
  const { width, height } = motionSubjectSize(subject);
  const motionContext = createMotionContext({
    absoluteFrame: node.startFrame + hostFrame,
    hostFrame,
    motionFrame: sample.modifierFrame,
    durationFrames: motion.durationFrames,
    progress: sample.progress,
    phase: sample.phase,
    fps: project.canvas.fps,
    width,
    height,
    seed,
  });
  const motionSubject = subject.kind === "text"
    ? subject.content
    : React.createElement("img", {
        src: await pngDataUri(sourceFramePath(subject.visual, hostFrame)),
        width,
        height,
        style: { width, height },
      });
  const props = bindSdkArtifactProps(component, motion.props, {
    fps: project.canvas.fps,
    ...(motion.propTypes === undefined
      ? {}
      : { declarations: motion.propTypes }),
  });
  const element = React.createElement(component, {
    subject: motionSubject,
    props,
    motionContext,
  });
  await Bun.write(
    outputPath,
    await rasterizeReact(
      element,
      width,
      height,
      subject.kind === "text"
        ? [...subject.layout.fonts, ...fonts]
        : fonts,
    ),
  );
}

export async function renderSparseVisualFrame(
  project: ResolvedProject,
  node: Exclude<RenderNode, AudioNode>,
  localFrame: number,
  outputPath: string,
  options: {
    bundleDirectory: string;
    fonts: SatoriFont[];
    ffmpegPath?: string;
    domPages?: number;
  },
): Promise<void> {
  if (
    !Number.isInteger(localFrame) ||
    localFrame < 0 ||
    localFrame >= node.durationFrames
  ) {
    fail(
      "INVALID_PREVIEW_TIME",
      `节点 "${node.id}" 的预览局部帧 ${localFrame}f 超出范围`,
    );
  }
  const motion = node.modifiers.find(
    (modifier): modifier is MotionNode =>
      modifier.kind === "motion" && modifier.enabled,
  );
  if (motion !== undefined) {
    const candidate = await bundleReactComponent(
      motion,
      options.bundleDirectory,
      project.resourceRoots,
    );
    const metadata = readSdkArtifact(candidate, "motion");
    if (
      metadata?.sdkAbiVersion === 1 &&
      metadata.renderer === "dom-timeline-ffmpeg-video"
    ) {
      if (node.kind !== "video") {
        fail(
          "FFMPEG_VIDEO_MOTION_HOST_REQUIRED",
          `FFmpeg Video Motion "${metadata.name}" 只能挂载到 video`,
        );
      }
      await renderSparseFfmpegVideoMotion(
        project,
        node,
        motion,
        candidate,
        localFrame,
        outputPath,
        options.ffmpegPath ?? "ffmpeg",
        options.domPages,
      );
      return;
    }
  }
  if (
    motion !== undefined &&
    (node.kind === "text" || node.kind === "subtitle")
  ) {
    const layout = await prepareTextLayout(node, project.canvas.width);
    const component = await bundleReactComponent(
      motion,
      options.bundleDirectory,
      project.resourceRoots,
    );
    if ((await renderDomMotionSamples(
      project,
      node,
      motion,
      { kind: "text", content: node.content, layout },
      component,
      [localFrame],
      () => outputPath,
      () => {},
      1,
      options.domPages,
    )) !== undefined) return;
    await renderMotionFrame(
      project,
      node,
      motion,
      { kind: "text", content: node.content, layout },
      component as MotionComponent,
      options.fonts,
      hashSeed(`${project.metadata.id}:${motion.id}`),
      localFrame,
      outputPath,
    );
    return;
  }
  const subjectPath = motion === undefined ? outputPath : `${outputPath}.subject.png`;
  if (node.kind === "text" || node.kind === "subtitle") {
    await renderTextNode(node, subjectPath, project.canvas.width);
  } else if (node.kind === "react") {
    await renderReactFrame(
      project,
      node,
      localFrame,
      subjectPath,
      options.bundleDirectory,
      options.fonts,
      options.domPages,
    );
  } else if (node.kind === "image") {
    await renderImageSubject(node, subjectPath);
  } else if (node.kind === "video") {
    await renderVideoSubjectFrame(
      project,
      node,
      localFrame,
      subjectPath,
      options.ffmpegPath ?? "ffmpeg",
    );
  } else {
    fail("INTERNAL_ERROR", `无法识别预览视觉节点 "${node.id}"`);
  }
  if (motion === undefined) return;
  const component = await bundleReactComponent(
    motion,
    options.bundleDirectory,
    project.resourceRoots,
  );
  if ((await renderDomMotionSamples(
    project,
    node,
    motion,
    {
      kind: "raster",
      visual: {
        nodeId: node.id,
        type: "static",
        path: subjectPath,
        width: node.width,
        height: node.height,
      },
    },
    component,
    [localFrame],
    () => outputPath,
    () => {},
    1,
    options.domPages,
  )) !== undefined) return;
  await renderMotionFrame(
    project,
    node,
    motion,
    {
      kind: "raster",
      visual: {
        nodeId: node.id,
        type: "static",
        path: subjectPath,
        width: node.width,
        height: node.height,
      },
    },
    component as MotionComponent,
    options.fonts,
    hashSeed(`${project.metadata.id}:${motion.id}`),
    localFrame,
    outputPath,
  );
}

async function renderMotionNode(
  project: ResolvedProject,
  node: VisualNode,
  motion: MotionNode,
  component: unknown,
  subject: PreparedMotionSubject,
  outputDirectory: string,
  fonts: SatoriFont[],
  concurrency: number,
  domPages: number | undefined,
  runtime: VisualTimelineRuntime,
  onFrame: () => void,
  signal?: AbortSignal,
  onDiagnostic?: RenderOptions["onDiagnostic"],
): Promise<PreparedTimelineArtifact | undefined> {
  const seed = hashSeed(`${project.metadata.id}:${motion.id}`);
  const domArtifact = await renderDomMotionSamples(
    project,
    node,
    motion,
    subject,
    component,
    Array.from({ length: node.durationFrames }, (_, frame) => frame),
    (hostFrame) => join(outputDirectory, frameFileName(hostFrame)),
    onFrame,
    concurrency,
    domPages,
    signal,
    runtime,
    onDiagnostic,
  );
  if (domArtifact !== undefined) return domArtifact;
  await runPool(
    node.durationFrames,
    concurrency,
    async (hostFrame) => {
      const outputPath = join(outputDirectory, frameFileName(hostFrame));
      await renderMotionFrame(
        project,
        node,
        motion,
        subject,
        component as MotionComponent,
        fonts,
        seed,
        hostFrame,
        outputPath,
      );
      onFrame();
    },
    signal,
  );
  return undefined;
}

interface RenderedFfmpegVideoMotion {
  readonly timelineArtifact: PreparedTimelineArtifact;
  readonly projections: readonly TimelineVideoSurface[];
  readonly maskPath: string;
}

function flatVideoSurface(width: number, height: number): TimelineVideoSurface {
  return Object.freeze({
    videoId: "subject",
    cornerRadiusRatio: 0,
    corners: Object.freeze([
      Object.freeze({ x: 0, y: 0 }),
      Object.freeze({ x: width, y: 0 }),
      Object.freeze({ x: 0, y: height }),
      Object.freeze({ x: width, y: height }),
    ]) as TimelineVideoSurface["corners"],
  });
}

function videoSurfaceMaskPng(
  surface: TimelineVideoSurface,
  width: number,
  height: number,
): Uint8Array {
  const [topLeft, topRight, bottomLeft, bottomRight] = surface.corners;
  const points = [topLeft, topRight, bottomRight, bottomLeft]
    .map(({ x, y }) => `${Number(x.toFixed(6))},${Number(y.toFixed(6))}`)
    .join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="black"/>` +
    `<polygon points="${points}" fill="white"/>` +
    `</svg>`;
  return new Resvg(svg).render().asPng();
}

async function renderFfmpegVideoMotion(
  project: ResolvedProject,
  node: VideoNode,
  motion: MotionNode,
  component: unknown,
  outputDirectory: string,
  concurrency: number,
  domPages: number | undefined,
  runtime: VisualTimelineRuntime,
  onFrame: () => void,
  signal?: AbortSignal,
  onDiagnostic?: RenderOptions["onDiagnostic"],
): Promise<RenderedFfmpegVideoMotion> {
  const metadata = readSdkArtifact(component, "motion");
  if (
    metadata?.sdkAbiVersion !== 1 ||
    metadata.renderer !== "dom-timeline-ffmpeg-video"
  ) {
    fail(
      "ARTIFACT_RUNTIME_MISMATCH",
      `Motion "${motion.id}" 不是 FFmpeg Video Motion`,
    );
  }
  if (motion.exportName !== "default") {
    fail(
      "ARTIFACT_EXPORT_INVALID",
      "FFmpeg Video Motion production entry 必须是 default export",
    );
  }
  const props = bindSdkArtifactProps(component, motion.props, {
    fps: project.canvas.fps,
    ...(motion.propTypes === undefined ? {} : { declarations: motion.propTypes }),
  });
  const compiled = await compileVisualArtifact({
    entryPath: motion.componentPath,
    props,
    composition: {
      width: node.width,
      height: node.height,
      fps: project.canvas.fps,
      fpsSource: project.canvas.fpsSource,
      durationInFrames: node.durationFrames,
    },
    fonts: await loadProjectFontSources(project.resourceRoots),
    seed: hashSeed(`${project.metadata.id}:${motion.id}`),
    motion: {
      startFrame: motion.localStartFrame,
      durationInFrames: motion.durationFrames,
      fill: motion.fill,
    },
  });
  const pageCount = Math.min(
    node.durationFrames,
    concurrency,
    effectiveDomPageCount(domPages),
  );
  const instances = await openTimelineInstances(runtime, compiled, pageCount);
  const projections = new Array<TimelineVideoSurface>(node.durationFrames);
  const maskDirectory = join(outputDirectory, "video-mask");
  await mkdir(maskDirectory, { recursive: true });
  const clock = new SampleClock(project.canvas.fpsSource);
  const transparent = await rasterizeReact(
    React.createElement("div", {
      style: { width: node.width, height: node.height, background: "transparent" },
    }),
    node.width,
    node.height,
    [],
  );
  try {
    await runPool(node.durationFrames, instances.length, async (hostFrame, workerIndex) => {
      if (signal?.aborted) fail("RENDER_CANCELLED", "渲染已取消");
      const outputPath = join(outputDirectory, frameFileName(hostFrame));
      if (sampleModifier(motion, hostFrame) === undefined) {
        const surface = flatVideoSurface(node.width, node.height);
        await Promise.all([
          Bun.write(outputPath, transparent),
          Bun.write(
            join(maskDirectory, frameFileName(hostFrame)),
            videoSurfaceMaskPng(surface, node.width, node.height),
          ),
        ]);
        projections[hostFrame] = surface;
        onFrame();
        return;
      }
      const instance = instances[workerIndex];
      if (instance === undefined) fail("INTERNAL_ERROR", "DOM page worker 不存在");
      const result = await instance.sample({
        time: clock.frameStart(hostFrame),
        ...(signal === undefined ? {} : { signal }),
      });
      if (result.videoSurfaces.length === 0) {
        fail(
          "VIDEO_SURFACE_REQUIRED",
          `FFmpeg Video Motion "${metadata.name}" 必须绑定一个 video surface`,
          { motionId: motion.id, hostId: node.id, frame: hostFrame },
        );
      }
      if (
        result.videoSurfaces.length !== 1 ||
        result.videoSurfaces[0]?.videoId !== "subject"
      ) {
        fail(
          "VIDEO_SURFACE_MULTIPLE",
          `FFmpeg Video Motion "${metadata.name}" 每帧必须只输出 subject surface`,
          { motionId: motion.id, hostId: node.id, frame: hostFrame },
        );
      }
      projections[hostFrame] = result.videoSurfaces[0];
      await Promise.all([
        Bun.write(outputPath, result.png),
        Bun.write(
          join(maskDirectory, frameFileName(hostFrame)),
          videoSurfaceMaskPng(result.videoSurfaces[0], node.width, node.height),
        ),
      ]);
      onFrame();
    }, signal);
  } finally {
    await Promise.allSettled(instances.map((instance) => instance.close()));
  }
  if (projections.some((surface) => surface === undefined)) {
    fail("VIDEO_SURFACE_REQUIRED", `Motion "${motion.id}" 的投影帧不完整`);
  }
  emitDiagnostic(
    { ...(onDiagnostic === undefined ? {} : { onDiagnostic }) },
    {
      phase: "preparing",
      scope: `visual/motion/${motion.id}/video-surface`,
      status: "complete",
      message: "FFmpeg Video Motion 投影已生成",
      details: { frames: projections.length, host: node.id },
    },
  );
  return Object.freeze({
    timelineArtifact: timelineArtifactRecord(motion.id, compiled),
    projections: Object.freeze(projections),
    maskPath: join(maskDirectory, "%08d.png"),
  });
}

async function encodeLosslessVisualSequence(input: {
  source: string;
  output: string;
  fpsSource: string;
  frames: number;
  ffmpegPath: string;
  signal?: AbortSignal;
}): Promise<void> {
  const process = Bun.spawn([
    input.ffmpegPath,
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-framerate",
    input.fpsSource,
    "-start_number",
    "0",
    "-i",
    input.source,
    "-frames:v",
    String(input.frames),
    "-an",
    "-c:v",
    "qtrle",
    "-pix_fmt",
    "argb",
    input.output,
  ], {
    stdout: "ignore",
    stderr: "pipe",
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  const [exitCode, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    if (input.signal?.aborted) fail("RENDER_CANCELLED", "视觉缓存封装已取消");
    fail("VISUAL_CACHE_ENCODE_FAILED", "无法封装无损视觉缓存", {
      exitCode,
      stderr: stderr.trim().slice(-12_000),
      source: input.source,
      output: input.output,
    });
  }
}

async function packageVisualForCache(input: {
  project: ResolvedProject;
  visual: PreparedVisual;
  staging: string;
  frameCount: number;
  persistent: boolean;
  ffmpegPath?: string;
  signal?: AbortSignal;
  onDiagnostic?: RenderOptions["onDiagnostic"];
}): Promise<PreparedVisual> {
  if (!input.persistent) return input.visual;
  if (input.visual.type === "static") {
    const output = join(input.staging, "static.png");
    if (resolve(input.visual.path) !== resolve(output)) {
      await Bun.write(output, Bun.file(input.visual.path));
      await rm(dirname(input.visual.path), { recursive: true, force: true });
    }
    return { ...input.visual, path: output };
  }
  if (input.visual.type !== "sequence") return input.visual;
  const output = join(input.staging, "visual.mov");
  const maskOutput = input.visual.ffmpegVideo === undefined
    ? undefined
    : join(input.staging, "mask.mov");
  emitDiagnostic(
    { ...(input.onDiagnostic === undefined ? {} : { onDiagnostic: input.onDiagnostic }) },
    {
      phase: "preparing",
      scope: `visual-cache/${input.visual.nodeId}/package`,
      status: "info",
      message: "将动态节点封装为无损 Alpha 媒体缓存",
      details: {
        frames: input.frameCount,
        output,
        ...(maskOutput === undefined ? {} : { maskOutput }),
      },
    },
  );
  const encode = (source: string, destination: string) =>
    encodeLosslessVisualSequence({
      source,
      output: destination,
      fpsSource: input.project.canvas.fpsSource,
      frames: input.frameCount,
      ffmpegPath: input.ffmpegPath ?? "ffmpeg",
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
  await Promise.all([
    encode(input.visual.path, output),
    ...(maskOutput === undefined || input.visual.ffmpegVideo === undefined
      ? []
      : [encode(input.visual.ffmpegVideo.maskPath, maskOutput)]),
  ]);
  await rm(dirname(input.visual.path), { recursive: true, force: true });
  return {
    ...input.visual,
    type: "media",
    path: output,
    ...(input.visual.ffmpegVideo === undefined || maskOutput === undefined
      ? {}
      : {
          ffmpegVideo: Object.freeze({
            projections: input.visual.ffmpegVideo.projections,
            maskPath: maskOutput,
          }),
        }),
  };
}

function textCacheIdentity(node: TextNode): Record<string, unknown> {
  return {
    content: node.content,
    role: node.role,
    font: node.font,
    fontSize: node.fontSize,
    lineHeight: node.lineHeight,
    color: node.color,
    align: node.align,
    verticalAlign: node.verticalAlign,
    maxLines: node.maxLines,
    overflow: node.overflow,
    background: node.background,
    autoWidth: node.autoWidth,
    autoHeight: node.autoHeight,
    width: node.width,
    height: node.height,
  };
}

function baseNodeCacheIdentity(
  project: ResolvedProject,
  node: Exclude<RenderNode, AudioNode>,
): Record<string, unknown> {
  const common = {
    projectId: project.metadata.id,
    nodeId: node.id,
    kind: node.kind,
    startFrame: node.startFrame,
    durationFrames: node.durationFrames,
    width: node.width,
    height: node.height,
    fps: project.canvas.fps,
    fpsSource: project.canvas.fpsSource,
    canvasWidth: project.canvas.width,
    profiles: [LEGACY_RENDER_PROFILE.hash, DOM_RENDER_PROFILE.hash],
  };
  if (node.kind === "text" || node.kind === "subtitle") {
    return { ...common, text: textCacheIdentity(node) };
  }
  if (node.kind === "react") {
    return {
      ...common,
      component: node.component,
      exportName: node.exportName,
      props: node.props,
      propTypes: node.propTypes,
    };
  }
  if (node.kind === "image") {
    return { ...common, fit: node.fit };
  }
  if ("inFrame" in node) {
    return {
      ...common,
      inFrame: node.inFrame,
      fit: node.fit,
      rate: node.rate,
      loop: node.loop,
    };
  }
  fail("INTERNAL_ERROR", `无法计算视觉缓存身份: ${node.id}`);
}

async function visualNodeCacheKey(input: {
  project: ResolvedProject;
  node: Exclude<RenderNode, AudioNode>;
  digester: VisualContentDigester;
  phase: "base" | "motion";
  subjectKey?: string;
  ffmpegPath?: string;
}): Promise<string> {
  const { project, node, phase } = input;
  const files = new Set<string>();
  const components: ComponentDescriptor[] = [];
  if (phase === "base" && node.kind === "react") components.push(node);
  const motion = phase === "motion"
    ? node.modifiers.find(
        (modifier): modifier is MotionNode =>
          modifier.kind === "motion" && modifier.enabled,
      )
    : undefined;
  if (motion !== undefined) components.push(motion);
  if (node.kind === "text" || node.kind === "subtitle") files.add(node.fontPath);
  if (node.kind === "image" || node.kind === "video") {
    files.add(node.sourcePath);
  }
  for (const component of components) {
    for (const path of await collectComponentDependencies(
      component,
      project.resourceRoots,
    )) files.add(path);
  }
  if (components.length > 0) {
    for (const font of await loadProjectFontSources(project.resourceRoots)) {
      files.add(font.source);
    }
  }
  return input.digester.digest({
    phase,
    base: baseNodeCacheIdentity(project, node),
    subjectKey: input.subjectKey,
    ...(motion === undefined
      ? {}
      : {
          motion: {
            id: motion.id,
            component: motion.component,
            exportName: motion.exportName,
            props: motion.props,
            propTypes: motion.propTypes,
            localStartFrame: motion.localStartFrame,
            durationFrames: motion.durationFrames,
            fill: motion.fill,
          },
          ffmpegPath: input.ffmpegPath ?? "ffmpeg",
        }),
  }, [...files]);
}

export async function prepareGeneratedVisuals(
  project: ResolvedProject,
  options: PrepareOptions,
): Promise<Map<string, PreparedVisual>> {
  const textNodes = project.nodes.filter(
    (node): node is TextNode =>
      (node.kind === "text" || node.kind === "subtitle") && node.enabled,
  );
  const reactNodes = project.nodes.filter(
    (node): node is ReactNode => node.kind === "react" && node.enabled,
  );
  const standaloneReactNodes = reactNodes.filter(
    (node) => !node.modifiers.some(
      (modifier) => modifier.kind === "motion" && modifier.enabled,
    ),
  );
  const motionHosts = project.nodes.filter(
    (node): node is Exclude<RenderNode, AudioNode> =>
      node.kind !== "audio" &&
      node.enabled &&
      node.modifiers.some(
        (modifier) => modifier.kind === "motion" && modifier.enabled,
      ),
  );
  const staticTextNodes = textNodes.filter(
    (node) =>
      !node.modifiers.some(
        (modifier) => modifier.kind === "motion" && modifier.enabled,
      ),
  );
  const totalUnits =
    staticTextNodes.length +
    reactNodes.reduce((total, node) => total + node.durationFrames, 0) +
    motionHosts.reduce((total, node) => total + node.durationFrames, 0);
  let completedUnits = 0;
  const report = (message: string, count = 1): void => {
    completedUnits += count;
    options.onProgress?.({
      phase: "preparing",
      progress:
        totalUnits === 0 ? 1 : Math.min(1, completedUnits / totalUnits),
      totalFrames: project.totalFrames,
      message,
    });
  };
  const frameReporter = (
    scope: string,
    total: number,
    message: string,
  ): RenderProgressReporter => {
    let completed = 0;
    let lastBucket = -1;
    return (count = 1, mode = "frames") => {
      completed += count;
      report(message, count);
      const bucket = Math.floor((completed / Math.max(1, total)) * 20);
      if (bucket === lastBucket) return;
      lastBucket = bucket;
      emitDiagnostic(options, {
        phase: "preparing",
        scope,
        status: "progress",
        message: mode === "static"
          ? `${message}：静态 PNG 已生成，复用 ${total} 帧时长`
          : `${message} ${completed}/${total} 帧`,
        details: mode === "static"
          ? { renderedSamples: 1, reusedDurationFrames: total }
          : { completedFrames: completed, totalFrames: total },
      });
    };
  };
  emitDiagnostic(options, {
    phase: "preparing",
    scope: "visuals/plan",
    status: "info",
    message: "生成式视觉计划已建立",
    details: {
      projectId: project.metadata.id,
      staticTextNodes: staticTextNodes.length,
      reactNodes: reactNodes.length,
      motionHosts: motionHosts.length,
      logicalProgressUnits: totalUnits,
    },
  });
  const result = new Map<string, PreparedVisual>();
  const generatedDirectory = join(
    options.temporaryDirectory,
    "generated-visuals",
  );
  const bundleDirectory = join(options.temporaryDirectory, "component-bundles");
  await mkdir(generatedDirectory, { recursive: true });
  await mkdir(bundleDirectory, { recursive: true });
  // Parsed in-memory projects are used by preview/testing consumers and must not
  // create persistent cache state in their fixture/source directory.
  const persistentVisualCache = project.sourcePath !== undefined;
  const visualCache = new VisualCache(
    project.sourcePath === undefined
      ? options.temporaryDirectory
      : project.rootProjectDir,
    options,
    persistentVisualCache,
  );
  const contentDigester = new VisualContentDigester(project.rootProjectDir);

  for (const node of staticTextNodes) {
    if (options.signal?.aborted) fail("RENDER_CANCELLED", "渲染已取消");
    const key = await visualNodeCacheKey({
      project,
      node,
      digester: contentDigester,
      phase: "base",
      ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
    });
    const cached = await visualCache.load(key);
    if (cached !== undefined) {
      result.set(node.id, cached);
      report(`已复用文本 ${node.id}`);
      continue;
    }
    const staging = await visualCache.createStaging(key);
    try {
      const path = join(staging, "static.png");
      const layout = await traceOperation(
        options,
        {
          phase: "preparing",
          scope: `visual/text/${node.id}`,
          message: `栅格化文本 ${node.id}`,
          details: { output: path },
        },
        () => renderTextNode(node, path, project.canvas.width),
      );
      const committed = await visualCache.commit({
        key,
        staging,
        frameCount: node.durationFrames,
        visual: {
          nodeId: node.id,
          type: "static",
          path,
          width: layout.width,
          height: layout.height,
          cacheKey: key,
        },
      });
      result.set(node.id, committed);
      report(`已生成文本 ${node.id}`);
    } catch (error) {
      await visualCache.discard(staging);
      throw error;
    }
  }

  const fonts = reactNodes.length === 0 && motionHosts.length === 0
    ? []
    : await traceOperation(
      options,
      {
        phase: "preparing",
        scope: "visuals/fonts",
        message: "加载工程字体",
        details: { resourceRoots: project.resourceRoots },
      },
      () => loadProjectFonts(project.resourceRoots),
    );
  const concurrency =
    options.frameConcurrency ?? Math.min(4, availableParallelism());
  const domPageCount = effectiveDomPageCount(options.domPages);
  emitDiagnostic(options, {
    phase: "preparing",
    scope: "visuals/runtime",
    status: "info",
    message: "初始化视觉渲染运行时",
    details: {
      frameConcurrency: concurrency,
      domPages: domPageCount,
      fonts: fonts.length,
    },
  });
  const ownsTimelineRuntime = options.timelineRuntime === undefined;
  const timelineRuntime = options.timelineRuntime ?? new VisualTimelineRuntime({
    maximumDomPages: domPageCount,
  });
  try {
  for (const node of standaloneReactNodes) {
    const key = await visualNodeCacheKey({
      project,
      node,
      digester: contentDigester,
      phase: "base",
      ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
    });
    const cached = await visualCache.load(key);
    if (cached !== undefined) {
      result.set(node.id, cached);
      report(`已复用 React 组件 ${node.id}`, node.durationFrames);
      continue;
    }
    const staging = await visualCache.createStaging(key);
    try {
      const directory = join(staging, "frames");
      await mkdir(directory, { recursive: true });
      const rendered = await traceOperation(
        options,
        {
          phase: "preparing",
          scope: `visual/react/${node.id}`,
          message: `准备 React 组件 ${node.id} 的渲染画面`,
          details: {
            frames: node.durationFrames,
            component: node.component,
            outputDirectory: directory,
          },
        },
        () => renderReactNode(
          project,
          node,
          directory,
          bundleDirectory,
          fonts,
          concurrency,
          options.domPages,
          timelineRuntime,
          frameReporter(
            `visual/react/${node.id}/frames`,
            node.durationFrames,
            `正在生成 React 组件 ${node.id}`,
          ),
          options.signal,
          options.onDiagnostic,
        ),
      );
      const packaged = await packageVisualForCache({
        project,
        staging,
        frameCount: node.durationFrames,
        persistent: persistentVisualCache,
        ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.onDiagnostic === undefined
          ? {}
          : { onDiagnostic: options.onDiagnostic }),
        visual: {
          nodeId: node.id,
          type: rendered.staticPath === undefined ? "sequence" : "static",
          path: rendered.staticPath ?? join(directory, "%08d.png"),
          width: node.width,
          height: node.height,
          cacheKey: key,
          ...(rendered.timelineArtifact === undefined
            ? {}
            : { timelineArtifacts: Object.freeze([rendered.timelineArtifact]) }),
        },
      });
      const committed = await visualCache.commit({
        key,
        staging,
        frameCount: node.durationFrames,
        visual: packaged,
      });
      result.set(node.id, committed);
    } catch (error) {
      await visualCache.discard(staging);
      throw error;
    }
  }

  for (const node of motionHosts) {
    if (options.signal?.aborted) fail("RENDER_CANCELLED", "渲染已取消");
    const motion = node.modifiers.find(
      (modifier): modifier is MotionNode =>
        modifier.kind === "motion" && modifier.enabled,
    );
    if (motion === undefined) continue;
    const prepared = result.get(node.id);
    const subjectKey = prepared?.cacheKey ?? await visualNodeCacheKey({
      project,
      node,
      digester: contentDigester,
      phase: "base",
      ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
    });
    const motionKey = await visualNodeCacheKey({
      project,
      node,
      digester: contentDigester,
      phase: "motion",
      subjectKey,
      ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
    });
    const cached = await visualCache.load(motionKey);
    if (cached !== undefined) {
      result.set(node.id, cached);
      if (node.kind === "react") {
        report(`已复用 React 组件 ${node.id}`, node.durationFrames);
      }
      report(`已复用 Motion ${motion.id}`, node.durationFrames);
      continue;
    }
    const component = await traceOperation(
      options,
      {
        phase: "preparing",
        scope: `visual/motion/${motion.id}/bundle`,
        message: `编译并加载 Motion 组件 ${motion.component}`,
        details: { componentPath: motion.componentPath, host: node.id },
      },
      () => bundleReactComponent(
        motion,
        bundleDirectory,
        project.resourceRoots,
      ),
    );
    const metadata = readSdkArtifact(component, "motion");
    if (
      metadata?.sdkAbiVersion === 1 &&
      metadata.renderer === "dom-timeline-ffmpeg-video"
    ) {
      if (node.kind !== "video") {
        fail(
          "FFMPEG_VIDEO_MOTION_HOST_REQUIRED",
          `FFmpeg Video Motion "${metadata.name}" 只能挂载到 video，收到 ${node.kind}`,
          { motionId: motion.id, hostId: node.id, hostKind: node.kind },
        );
      }
      const staging = await visualCache.createStaging(motionKey);
      try {
        const directory = join(staging, "frames");
        await mkdir(directory, { recursive: true });
        const rendered = await traceOperation(
          options,
          {
            phase: "preparing",
            scope: `visual/motion/${motion.id}`,
            message: `生成 FFmpeg Video Motion ${motion.id}`,
            details: { host: node.id, frames: node.durationFrames },
          },
          () => renderFfmpegVideoMotion(
            project,
            node,
            motion,
            component,
            directory,
            concurrency,
            options.domPages,
            timelineRuntime,
            frameReporter(
              `visual/motion/${motion.id}/frames`,
              node.durationFrames,
              `正在生成 FFmpeg Video Motion ${motion.id}`,
            ),
            options.signal,
            options.onDiagnostic,
          ),
        );
        const packaged = await packageVisualForCache({
          project,
          staging,
          frameCount: node.durationFrames,
          persistent: persistentVisualCache,
          ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
          ...(options.onDiagnostic === undefined
            ? {}
            : { onDiagnostic: options.onDiagnostic }),
          visual: {
            nodeId: node.id,
            type: "sequence",
            path: join(directory, "%08d.png"),
            width: node.width,
            height: node.height,
            cacheKey: motionKey,
            ffmpegVideo: Object.freeze({
              projections: rendered.projections,
              maskPath: rendered.maskPath,
            }),
            timelineArtifacts: Object.freeze([rendered.timelineArtifact]),
          },
        });
        const committed = await visualCache.commit({
          key: motionKey,
          staging,
          frameCount: node.durationFrames,
          visual: packaged,
        });
        result.set(node.id, committed);
      } catch (error) {
        await visualCache.discard(staging);
        throw error;
      }
      continue;
    }
    let subject: PreparedMotionSubject | undefined;
    if (node.kind === "text" || node.kind === "subtitle") {
      subject = {
        kind: "text",
        content: node.content,
        layout: await traceOperation(
          options,
          {
            phase: "preparing",
            scope: `visual/motion/${node.id}/subject-text`,
            message: `准备 Motion 文本宿主 ${node.id}`,
          },
          () => prepareTextLayout(node, project.canvas.width),
        ),
      };
    } else if (node.kind === "react") {
      const directory = join(generatedDirectory, `react-subject-${node.id}`);
      await mkdir(directory, { recursive: true });
      const rendered = await traceOperation(
        options,
        {
          phase: "preparing",
          scope: `visual/react/${node.id}`,
          message: `准备 Motion 的 React 宿主 ${node.id}`,
          details: { frames: node.durationFrames, outputDirectory: directory },
        },
        () => renderReactNode(
          project,
          node,
          directory,
          bundleDirectory,
          fonts,
          concurrency,
          options.domPages,
          timelineRuntime,
          frameReporter(
            `visual/react/${node.id}/frames`,
            node.durationFrames,
            `正在生成 React 组件 ${node.id}`,
          ),
          options.signal,
          options.onDiagnostic,
        ),
      );
      const visual: PreparedVisual = {
        nodeId: node.id,
        type: rendered.staticPath === undefined ? "sequence" : "static",
        path: rendered.staticPath ?? join(directory, "%08d.png"),
        width: node.width,
        height: node.height,
        cacheKey: subjectKey,
        ...(rendered.timelineArtifact === undefined
          ? {}
          : { timelineArtifacts: Object.freeze([rendered.timelineArtifact]) }),
      };
      result.set(node.id, visual);
      subject = { kind: "raster", visual };
    } else if (prepared !== undefined) {
      subject = { kind: "raster", visual: prepared };
    } else if (node.kind === "image") {
      const path = join(generatedDirectory, `image-subject-${node.id}.png`);
      await renderImageSubject(node, path);
      subject = {
        kind: "raster",
        visual: {
          nodeId: node.id,
          type: "static",
          path,
          width: node.width,
          height: node.height,
        },
      };
    } else if (node.kind === "video") {
      const directory = join(generatedDirectory, `video-subject-${node.id}`);
      await mkdir(directory, { recursive: true });
      await traceOperation(
        options,
        {
          phase: "preparing",
          scope: `visual/motion/${node.id}/subject-video`,
          message: `提取 Motion 视频宿主 ${node.id}`,
          details: { frames: node.durationFrames, sourcePath: node.sourcePath },
        },
        () => renderVideoSubjects(
          project,
          node,
          directory,
          options.ffmpegPath ?? "ffmpeg",
        ),
      );
      subject = {
        kind: "raster",
        visual: {
          nodeId: node.id,
          type: "sequence",
          path: join(directory, "%08d.png"),
          width: node.width,
          height: node.height,
        },
      };
    }
    if (subject === undefined) {
      fail(
        "MISSING_GENERATED_VISUAL",
        `Motion 宿主 "${node.id}" 缺少本体画面`,
      );
    }
    const staging = await visualCache.createStaging(motionKey);
    try {
      const directory = join(staging, "frames");
      await mkdir(directory, { recursive: true });
      const timelineArtifact = await traceOperation(
        options,
        {
          phase: "preparing",
          scope: `visual/motion/${motion.id}`,
          message: `生成 Motion ${motion.id} 的逐帧画面`,
          details: {
            host: node.id,
            frames: node.durationFrames,
            component: motion.component,
            outputDirectory: directory,
          },
        },
        () => renderMotionNode(
          project,
          node,
          motion,
          component,
          subject,
          directory,
          fonts,
          concurrency,
          options.domPages,
          timelineRuntime,
          frameReporter(
            `visual/motion/${motion.id}/frames`,
            node.durationFrames,
            `正在生成 Motion ${motion.id}`,
          ),
          options.signal,
          options.onDiagnostic,
        ),
      );
      const { width, height } = motionSubjectSize(subject);
      const packaged = await packageVisualForCache({
        project,
        staging,
        frameCount: node.durationFrames,
        persistent: persistentVisualCache,
        ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.onDiagnostic === undefined
          ? {}
          : { onDiagnostic: options.onDiagnostic }),
        visual: {
          nodeId: node.id,
          type: "sequence",
          path: join(directory, "%08d.png"),
          width,
          height,
          cacheKey: motionKey,
          ...(timelineArtifact === undefined
            ? {}
            : {
                timelineArtifacts: Object.freeze([
                  ...(result.get(node.id)?.timelineArtifacts ?? []),
                  timelineArtifact,
                ]),
              }),
        },
      });
      const committed = await visualCache.commit({
        key: motionKey,
        staging,
        frameCount: node.durationFrames,
        visual: packaged,
      });
      result.set(node.id, committed);
    } catch (error) {
      await visualCache.discard(staging);
      throw error;
    }
  }
  emitDiagnostic(options, {
    phase: "preparing",
    scope: "visuals/plan",
    status: "complete",
    message: "生成式视觉准备完成",
    details: { preparedVisuals: result.size, totalUnits },
  });
  return result;
  } finally {
    if (ownsTimelineRuntime) {
      await traceOperation(
        options,
        {
          phase: "cleanup",
          scope: "visuals/runtime",
          message: "关闭 DOM Timeline 运行时",
        },
        () => timelineRuntime.close(),
      );
    }
  }
}
