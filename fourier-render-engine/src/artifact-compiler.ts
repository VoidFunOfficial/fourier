import { createHash } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { dirname, extname, join, resolve } from "node:path";
import type React from "react";
import {
  authorRuntimeAliasPlugin,
  isCompilerInjectedReactImport,
  isReactRuntimeImport,
  isSdkAuthorImport,
} from "./author-runtime.ts";
import {
  assertSynchronousArtifactResult,
  bindSdkArtifactProps,
  readSdkArtifact,
  type ArtifactKind,
} from "./artifact-protocol.ts";
import { createDomBootstrapSource } from "./dom-bootstrap-source.ts";
import { hashSeed } from "./deterministic.ts";
import { fail } from "./errors.ts";
import {
  imageAssetUrlPlugin,
  type BundledImageAsset,
} from "./image-assets.ts";
import {
  DOM_RENDER_PROFILE,
  type RenderProfile,
} from "./render-profile.ts";
import type { RationalTime } from "./time.ts";
import type { ModifierFill, RenderContext } from "./types.ts";

const forbiddenDomSource: Array<[RegExp, string]> = [
  [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/, "网络访问 API"],
  [/\bDate\s*(?:\.|\()/, "系统时间 Date"],
  [/\bperformance\.now\s*\(/, "系统时间 performance.now"],
  [/\bMath\.random\s*\(/, "Math.random"],
  [/\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/, "浏览器计时器"],
  [/\b(?:Bun|Deno|process)\b/, "运行时全局对象"],
];

async function resolveDomDependency(importer: string, specifier: string): Promise<string> {
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
    `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`,
    `${base}.mjs`, `${base}.css`, `${base}.json`, `${base}.svg`,
    join(base, "index.ts"), join(base, "index.tsx"), join(base, "index.js"),
  ];
  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) return candidate;
  }
  fail("COMPONENT_IMPORT_NOT_FOUND", `DOM artifact 依赖不存在: ${specifier}`, {
    importer,
    specifier,
  });
}

async function validateDomEntrySource(entryPath: string): Promise<readonly string[]> {
  const dependencies = new Set<string>();
  const visit = async (path: string): Promise<void> => {
    if (dependencies.has(path)) return;
    dependencies.add(path);
    const extension = extname(path).toLowerCase();
    const source = await Bun.file(path).text();
    if (extension === ".css") {
      if (/url\(\s*["']?(?:https?:|\/\/)/i.test(source) || /@import\s+["'](?:https?:|\/\/)/i.test(source)) {
        fail("UNSUPPORTED_DOM_TIMELINE_API", "ABI v1 CSS 不允许网络 URL", { entryPath: path });
      }
      return;
    }
    if (![".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].includes(extension)) return;
    for (const [pattern, label] of forbiddenDomSource) {
      if (pattern.test(source)) {
        fail(
          "UNSUPPORTED_DOM_TIMELINE_API",
          `ABI v1 artifact 不允许使用 ${label}`,
          { entryPath: path, api: label },
        );
      }
    }
    const loader = extension === ".ts" || extension === ".mts" || extension === ".cts" ? "ts"
      : extension === ".js" || extension === ".mjs" || extension === ".cjs" ? "js"
      : extension === ".jsx" ? "jsx"
      : "tsx";
    for (const dependency of new Bun.Transpiler({ loader }).scanImports(source)) {
      if (dependency.path.startsWith(".")) {
        await visit(await resolveDomDependency(path, dependency.path));
      } else if (isCompilerInjectedReactImport(dependency)) {
        continue;
      } else if (isReactRuntimeImport(dependency.path)) {
        fail(
          "INVALID_COMPONENT_IMPORT",
          `ABI v1 artifact 必须从 @fourier-video/sdk 导入 React 能力，禁止直接导入: ${dependency.path}`,
          { importer: path, specifier: dependency.path },
        );
      } else if (!isSdkAuthorImport(dependency.path)) {
        fail("INVALID_COMPONENT_IMPORT", `ABI v1 artifact 不允许 bare import: ${dependency.path}`, {
          importer: path,
          specifier: dependency.path,
        });
      }
    }
  };
  await visit(entryPath);
  return Object.freeze([...dependencies].sort());
}

export interface CompiledArtifactComposition {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly fpsSource: string;
  readonly durationInFrames: number;
}

export interface CompiledArtifactFont {
  readonly family: string;
  readonly source: string;
  readonly sha256: string;
  readonly dataUrl?: string;
}

export interface BrowserBundleSnapshot {
  readonly javascript: string;
  readonly css: string;
  readonly hash: string;
  readonly imageAssets?: readonly BundledImageAsset[];
}

export interface DynamicSubjectSample {
  readonly dataUrl: string;
  readonly digest: string;
  readonly png: Uint8Array;
}

export type DynamicSubjectProvider = (
  time: RationalTime,
  signal?: AbortSignal,
) => Promise<DynamicSubjectSample>;

export interface CompiledVisualArtifact {
  readonly sdkAbiVersion: 1;
  readonly renderer:
    | "dom-timeline"
    | "dom-timeline-ffmpeg-video";
  readonly kind: ArtifactKind;
  readonly name: string;
  readonly snapshotId: string;
  readonly entryPath: string;
  readonly sourceArtifact?: unknown;
  readonly bundleSnapshot: BrowserBundleSnapshot;
  readonly props: Readonly<Record<string, unknown>>;
  readonly propsDigest: string;
  readonly dependencies: readonly string[];
  readonly dependencyDigest: string;
  readonly composition: CompiledArtifactComposition;
  readonly fonts: readonly CompiledArtifactFont[];
  readonly seed: number;
  readonly renderProfile: RenderProfile;
  readonly supportsTextMotion?: boolean;
  readonly videoComposition?: "ffmpeg";
  readonly subject?: React.ReactNode | ((input: {
    frame: number;
    context: Readonly<RenderContext>;
  }) => React.ReactNode);
  readonly motion?: {
    readonly startFrame: number;
    readonly durationInFrames: number;
    readonly fill: ModifierFill;
  };
  /** Source text for the dedicated Text Motion component path. */
  readonly textSubject?: string;
  readonly dynamicSubjectProvider?: DynamicSubjectProvider;
}

export interface CompileVisualArtifactOptions {
  entryPath?: string;
  exportName?: "default";
  props?: Readonly<Record<string, unknown>>;
  composition?: {
    width: number;
    height: number;
    fps: number;
    fpsSource?: string;
    durationInFrames: number;
  };
  fonts?: readonly { family: string; source: string }[];
  seed?: number;
  subject?: CompiledVisualArtifact["subject"];
  motion?: CompiledVisualArtifact["motion"];
  textSubject?: string;
  snapshotId?: string;
  dynamicSubjectProvider?: DynamicSubjectProvider;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    fail("INVALID_ARTIFACT_REQUEST", `${field} 必须是正安全整数`, { field, value });
  }
  return value as number;
}

function stableValue(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`)
    .join(",")}}`;
}

function digest(...values: readonly (string | Uint8Array)[]): string {
  const hash = createHash("sha256");
  for (const value of values) hash.update(value);
  return hash.digest("hex");
}

function previewRecord(value: unknown, name: string): Record<string, any> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("INVALID_DESIGN_PREVIEW", `${name}.designPreview() 必须返回对象`);
  }
  return value as Record<string, any>;
}

function resolveComposition(
  explicit: CompileVisualArtifactOptions["composition"],
  preview: Record<string, any>,
): CompiledArtifactComposition {
  if (explicit !== undefined) {
    const fps = positiveInteger(explicit.fps, "composition.fps");
    return Object.freeze({
      width: positiveInteger(explicit.width, "composition.width"),
      height: positiveInteger(explicit.height, "composition.height"),
      fps,
      fpsSource: explicit.fpsSource ?? String(fps),
      durationInFrames: positiveInteger(
        explicit.durationInFrames,
        "composition.durationInFrames",
      ),
    });
  }
  const source = preview.composition;
  if (typeof source !== "object" || source === null) {
    fail("INVALID_DESIGN_PREVIEW", "designPreview.composition 必须是对象");
  }
  const width = positiveInteger(source.width, "designPreview.composition.width");
  const height = positiveInteger(source.height, "designPreview.composition.height");
  const durationSeconds = source.durationSeconds;
  if (!Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 30) {
    fail("INVALID_DESIGN_PREVIEW", "durationSeconds 必须是 0—30 的整数");
  }
  return Object.freeze({
    width,
    height,
    fps: 60,
    fpsSource: "60",
    durationInFrames: durationSeconds === 0 ? 1 : durationSeconds * 60,
  });
}

async function loadArtifact(options: CompileVisualArtifactOptions): Promise<{
  artifact: unknown;
  entryPath: string;
  bundleHash: string;
}> {
  if (typeof options.entryPath !== "string" || options.entryPath.length === 0) {
    fail("INVALID_ARTIFACT_REQUEST", "必须提供 entryPath");
  }
  if (options.exportName !== undefined && options.exportName !== "default") {
    fail("ARTIFACT_EXPORT_INVALID", "ABI v1 openArtifact 仅支持 default export");
  }
  const entryPath = resolve(options.entryPath);
  const file = await stat(entryPath).catch(() => undefined);
  if (file === undefined || !file.isFile()) {
    fail("ARTIFACT_ENTRY_NOT_FOUND", `artifact entry 不存在: ${entryPath}`);
  }
  const bundleDirectory = await mkdtemp(join(tmpdir(), "fourier-artifact-metadata-"));
  try {
    const result = await Bun.build({
      entrypoints: [entryPath],
      outdir: bundleDirectory,
      target: "bun",
      format: "esm",
      splitting: false,
      minify: false,
      sourcemap: "inline",
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      plugins: [
        imageAssetUrlPlugin("fourier-artifact-metadata-images"),
        authorRuntimeAliasPlugin("fourier-artifact-metadata-runtime"),
      ],
    });
    const output = result.outputs.find((candidate) => candidate.type.startsWith("text/javascript"));
    if (!result.success || output === undefined) {
      fail(
        "ARTIFACT_COMPILE_FAILED",
        result.logs.map((log) => log.message).join("\n") || `无法编译 artifact: ${entryPath}`,
        { entryPath },
      );
    }
    const module = await import(
      `${pathToFileURL(output.path).href}?mtime=${file.mtimeMs}`
    ) as Record<string, unknown>;
    return {
      artifact: module.default,
      entryPath,
      bundleHash: digest(new Uint8Array(await output.arrayBuffer())),
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ARTIFACT_COMPILE_FAILED") {
      throw error;
    }
    fail(
      "ARTIFACT_COMPILE_FAILED",
      `无法加载 artifact: ${error instanceof Error ? error.message : String(error)}`,
      { entryPath },
    );
  } finally {
    await rm(bundleDirectory, { recursive: true, force: true });
  }
}

async function browserBundle(entryPath: string): Promise<BrowserBundleSnapshot> {
  const source = createDomBootstrapSource(entryPath);
  const imageAssets = new Map<string, BundledImageAsset>();
  const result = await Bun.build({
    entrypoints: ["fourier:dom-bootstrap"],
    target: "browser",
    format: "iife",
    minify: false,
    sourcemap: "inline",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [{
      name: "fourier-dom-runtime-aliases",
      setup(build) {
        build.onResolve({ filter: /^fourier:dom-bootstrap$/ }, () => ({
          path: "dom-bootstrap",
          namespace: "fourier",
        }));
        build.onLoad({ filter: /^dom-bootstrap$/, namespace: "fourier" }, () => ({
          contents: source,
          loader: "tsx",
        }));
      },
    },
    imageAssetUrlPlugin(
      "fourier-dom-images",
      (asset) => imageAssets.set(asset.url, asset),
    ),
    authorRuntimeAliasPlugin("fourier-dom-author-runtime", { reactDom: true })],
  });
  if (!result.success) {
    fail("ARTIFACT_COMPILE_FAILED", result.logs.map((log) => log.message).join("\n"));
  }
  let javascript = "";
  let css = "";
  const assets = new Map<string, string>();
  for (const output of result.outputs) {
    if (output.type.startsWith("text/javascript")) javascript += await output.text();
    if (output.type.startsWith("text/css")) css += await output.text();
    if (!output.type.startsWith("text/javascript") && !output.type.startsWith("text/css")) {
      const filename = output.path.split("/").at(-1)!;
      const bytes = new Uint8Array(await output.arrayBuffer());
      assets.set(filename, `data:${output.type || "application/octet-stream"};base64,${Buffer.from(bytes).toString("base64")}`);
    }
  }
  for (const [filename, dataUrl] of assets) {
    javascript = javascript.replaceAll(`./${filename}`, dataUrl).replaceAll(filename, dataUrl);
    css = css.replaceAll(`./${filename}`, dataUrl).replaceAll(filename, dataUrl);
  }
  if (javascript === "") fail("ARTIFACT_COMPILE_FAILED", "browser bundle 缺少 JavaScript output");
  const bundledImages = Object.freeze([...imageAssets.values()]);
  return Object.freeze({
    javascript,
    css,
    imageAssets: bundledImages,
    hash: digest(
      javascript,
      css,
      ...bundledImages.flatMap((asset) => [asset.url, asset.base64]),
    ),
  });
}

async function compileFonts(
  sources: readonly { family: string; source: string }[],
): Promise<readonly CompiledArtifactFont[]> {
  const fonts: CompiledArtifactFont[] = [];
  for (const source of sources) {
    if (typeof source.family !== "string" || source.family.trim() === "") {
      fail("INVALID_ARTIFACT_FONT", "font.family 必须是非空字符串");
    }
    const path = source.source.startsWith("file:")
      ? new URL(source.source).pathname
      : source.source;
    const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
    fonts.push(Object.freeze({
      family: source.family,
      source: path,
      sha256: digest(bytes),
      dataUrl: `data:font/woff2;base64,${Buffer.from(bytes).toString("base64")}`,
    }));
  }
  return Object.freeze(fonts);
}

export async function compileVisualArtifact(
  options: CompileVisualArtifactOptions,
): Promise<CompiledVisualArtifact> {
  const loaded = await loadArtifact(options);
  const metadata = readSdkArtifact(loaded.artifact);
  if (metadata === undefined) {
    fail("ARTIFACT_EXPORT_INVALID", "artifact 必须由 @fourier-video/sdk 定义");
  }
  const preview = previewRecord(assertSynchronousArtifactResult(
    metadata.designPreview(),
    `${metadata.name}.designPreview()`,
  ), metadata.name);
  const composition = resolveComposition(options.composition, preview);
  const props = bindSdkArtifactProps(
    loaded.artifact,
    options.props ?? preview.props ?? {},
    { fps: composition.fps },
  );
  const seed = options.seed ?? preview.seed ?? hashSeed(`${metadata.name}:artifact-preview`);
  if (!Number.isSafeInteger(seed) || seed < 0) {
    fail("INVALID_ARTIFACT_REQUEST", "seed 必须是非负安全整数");
  }
  const ffmpegVideo = metadata.renderer === "dom-timeline-ffmpeg-video";
  const textSubject = options.textSubject ?? (
    metadata.kind === "motion" &&
    metadata.supportsTextMotion &&
    typeof preview.subject === "string"
      ? preview.subject
      : undefined
  );
  if (textSubject !== undefined) {
    if (metadata.kind !== "motion") {
      fail("ARTIFACT_KIND_MISMATCH", "只有 Motion artifact 可以接收 textSubject");
    }
    if (!metadata.supportsTextMotion) {
      fail(
        "TEXT_MOTION_UNSUPPORTED",
        `${metadata.name} 未声明支持 Text Motion`,
        { artifact: metadata.name },
      );
    }
  }
  const artifactDependencies = await validateDomEntrySource(loaded.entryPath);
  const fonts = await compileFonts(options.fonts ?? preview.fonts ?? []);
  const bundleSnapshot = await browserBundle(loaded.entryPath);
  const dependencies = Object.freeze([
    ...artifactDependencies,
    ...fonts.map((font) => font.source),
  ]);
  const dependencyContents = await Promise.all(dependencies.map(async (source) => ({
    source,
    sha256: digest(new Uint8Array(await Bun.file(source).arrayBuffer())),
  })));
  const propsDigest = digest(stableValue(props));
  const dependencyDigest = digest(
    stableValue(dependencyContents),
    loaded.bundleHash,
    bundleSnapshot.hash,
    stableValue(fonts.map((font) => ({
      family: font.family,
      sha256: font.sha256,
    }))),
  );
  const renderProfile = DOM_RENDER_PROFILE;
  const snapshotId = options.snapshotId ?? digest(
    metadata.name,
    String(metadata.sdkAbiVersion),
    propsDigest,
    dependencyDigest,
    renderProfile.hash,
    stableValue(composition),
    String(seed),
    stableValue(options.motion ?? preview.motion ?? null),
    textSubject ?? "",
  );
  const subject = options.subject ?? preview.subject;
  const motion = options.motion ?? preview.motion;
  return Object.freeze({
    sdkAbiVersion: metadata.sdkAbiVersion,
    renderer: ffmpegVideo
      ? "dom-timeline-ffmpeg-video"
      : "dom-timeline",
    kind: metadata.kind,
    name: metadata.name,
    snapshotId,
    entryPath: loaded.entryPath,
    sourceArtifact: loaded.artifact,
    bundleSnapshot,
    props,
    propsDigest,
    dependencies,
    dependencyDigest,
    composition,
    fonts,
    seed,
    renderProfile,
    ...(metadata.kind === "motion" && !ffmpegVideo
      ? { supportsTextMotion: metadata.supportsTextMotion }
      : {}),
    ...(ffmpegVideo ? { videoComposition: "ffmpeg" as const } : {}),
    ...(subject === undefined ? {} : { subject }),
    ...(motion === undefined ? {} : { motion }),
    ...(textSubject === undefined
      ? {}
      : { textSubject }),
    ...(options.dynamicSubjectProvider === undefined
      ? {}
      : { dynamicSubjectProvider: options.dynamicSubjectProvider }),
  });
}
