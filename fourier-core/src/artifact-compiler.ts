import { createHash } from "node:crypto";
import { access, chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  authorRuntimeAliasPlugin,
  isReactRuntimeImport,
  isSdkAuthorImport,
} from "./author-runtime.ts";
import type { ArtifactKind, SupportedSdkAbiVersion } from "./artifact-protocol.ts";
import { createDomBootstrapSource } from "./dom-bootstrap-source.ts";
import { hashSeed } from "./deterministic.ts";
import { CoreError, fail } from "./errors.ts";
import { imageAssetUrlPlugin, type BundledImageAsset } from "./image-assets.ts";
import { DOM_RENDER_PROFILE, type RenderProfile } from "./render-profile.ts";
import { SecureExecutionHost } from "./secure-execution-host.ts";
import {
  buildSecureBrowserBundle,
  formatBrowserBuildFailure,
  scanModuleImports,
} from "./secure-browser-bundler.ts";
import type { RationalTime } from "./time.ts";
import type { ArtifactHostOptions, ArtifactSubject, ModifierFill } from "./integration-types.ts";

const SOURCE_FILE_LIMIT = 500;
const SOURCE_FILE_BYTES = 20 * 1024 * 1024;
const SOURCE_TOTAL_BYTES = 200 * 1024 * 1024;
const FONT_COUNT_LIMIT = 16;
const FONT_FILE_BYTES = 8 * 1024 * 1024;
const FONT_TOTAL_BYTES = 32 * 1024 * 1024;

const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const forbiddenDomSource: Array<[RegExp, string]> = [
  [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/, "网络访问 API"],
  [/\bDate\s*(?:\.|\()/, "系统时间 Date"],
  [/\bperformance\.now\s*\(/, "系统时间 performance.now"],
  [/\bMath\.random\s*\(/, "Math.random"],
  [/\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/, "浏览器计时器"],
  [/\b(?:Bun|Deno|process)\b/, "运行时全局对象"],
];

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

/** @deprecated Dynamic subjects belong to a timeline runtime request, never a compiled artifact. */
export type DynamicSubjectProvider = (time: RationalTime, signal?: AbortSignal) => Promise<DynamicSubjectSample>;

export interface CompiledArtifactDesignPreview {
  readonly composition: Readonly<{ width: number; height: number; durationSeconds: number }>;
  readonly props: Readonly<Record<string, unknown>>;
  readonly fonts?: readonly Readonly<{ family: string; source: string }>[];
  readonly seed?: number;
  readonly player?: Readonly<Record<string, unknown>>;
  readonly motion?: Readonly<{
    startFrame?: number;
    durationInFrames?: number;
    fill?: ModifierFill;
  }>;
  readonly textSubject?: string;
}

export interface CompiledVisualArtifact {
  readonly sdkAbiVersion: SupportedSdkAbiVersion;
  readonly renderer: "dom-timeline" | "dom-timeline-ffmpeg-video";
  readonly kind: ArtifactKind;
  readonly name: string;
  readonly snapshotId: string;
  readonly entryPath: string;
  /** @deprecated Functions cannot cross the evaluator seam; runtime never returns this field. */
  readonly sourceArtifact?: unknown;
  readonly bundleSnapshot: BrowserBundleSnapshot;
  readonly designPreview: CompiledArtifactDesignPreview;
  readonly static: boolean;
  readonly useDesignPreview: boolean;
  readonly schema: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
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
  readonly modifier?: { readonly startFrame: number; readonly durationInFrames: number; readonly fill: ModifierFill };
  /** @deprecated Use modifier. Kept for ABI 1/1.1 Motion consumers. */
  readonly motion?: { readonly startFrame: number; readonly durationInFrames: number; readonly fill: ModifierFill };
  readonly textSubject?: string;
}

export interface CompileVisualArtifactOptions {
  readonly mode?: "design-preview" | "production";
  readonly sourceRoot?: string;
  readonly resourceRoots?: readonly string[];
  readonly signal?: AbortSignal;
  readonly entryPath?: string;
  /** @deprecated Only default is accepted; this field will be removed next major. */
  readonly exportName?: "default";
  readonly props?: Readonly<Record<string, unknown>>;
  readonly composition?: {
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly fpsSource?: string;
    readonly durationInFrames: number;
  };
  readonly fonts?: readonly { readonly family: string; readonly source: string }[];
  readonly seed?: number;
  /** @deprecated ReactNode values cannot cross the secure evaluator seam. */
  readonly subject?: ArtifactSubject;
  readonly modifier?: CompiledVisualArtifact["modifier"];
  /** @deprecated Use modifier. */
  readonly motion?: CompiledVisualArtifact["motion"];
  readonly textSubject?: string;
  readonly snapshotId?: string;
  /** @deprecated Supply this to the timeline runtime instead. */
  readonly dynamicSubjectProvider?: DynamicSubjectProvider;
}

interface SourceGraphEntry {
  readonly sourcePath: string;
  readonly relativePath: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

interface ImmutableSourceSnapshot {
  readonly sourceRoot: string;
  readonly entryPath: string;
  readonly snapshotEntryPath: string;
  readonly dependencies: readonly SourceGraphEntry[];
  cleanup(): Promise<void>;
}

interface ArtifactInspection {
  readonly sdkAbiVersion: SupportedSdkAbiVersion;
  readonly renderer: "dom-timeline" | "dom-timeline-ffmpeg-video";
  readonly kind: ArtifactKind;
  readonly name: string;
  readonly static: boolean;
  readonly supportsTextMotion?: boolean;
  readonly videoComposition?: "ffmpeg";
  readonly designPreview: CompiledArtifactDesignPreview;
  readonly schema: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly props: Readonly<Record<string, unknown>>;
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function digest(...values: readonly (string | Uint8Array)[]): string {
  const hash = createHash("sha256");
  for (const value of values) hash.update(value);
  return hash.digest("hex");
}

function stableValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`).join(",")}}`;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    fail("INVALID_ARTIFACT_REQUEST", `${field} 必须是正安全整数`, { field, value });
  }
  return value as number;
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("SECURE_EXECUTION_PROTOCOL_INVALID", `${field} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(value: Record<string, unknown>, keys: readonly string[], field: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) fail("SECURE_EXECUTION_PROTOCOL_INVALID", `${field} 包含未知字段`, { unknown });
}

async function canonicalDirectory(path: string, field: string): Promise<string> {
  const canonical = await realpath(resolve(path)).catch(() => undefined);
  if (canonical === undefined || !(await stat(canonical)).isDirectory()) {
    fail("ARTIFACT_SOURCE_OUTSIDE_ROOT", `${field} 不是可读取目录: ${path}`);
  }
  return canonical;
}

async function resolveDomDependency(importer: string, specifier: string): Promise<string> {
  const base = resolve(dirname(importer), specifier);
  const extension = extname(base).toLowerCase();
  const sourceBase = extension === "" ? base : base.slice(0, -extension.length);
  const substitutions = extension === ".js" ? [`${sourceBase}.ts`, `${sourceBase}.tsx`]
    : extension === ".jsx" ? [`${sourceBase}.tsx`]
    : extension === ".mjs" ? [`${sourceBase}.mts`]
    : extension === ".cjs" ? [`${sourceBase}.cts`] : [];
  const candidates = [
    base, ...substitutions,
    `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.css`, `${base}.json`, `${base}.svg`,
    join(base, "index.ts"), join(base, "index.tsx"), join(base, "index.js"),
  ];
  for (const candidate of candidates) {
    const canonical = await realpath(candidate).catch(() => undefined);
    if (canonical !== undefined && (await stat(candidate)).isFile()) return resolve(candidate);
  }
  fail("COMPONENT_IMPORT_NOT_FOUND", `DOM artifact 依赖不存在: ${specifier}`, { importer, specifier });
}

function cssDependencies(source: string): readonly string[] {
  return [...source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => value !== undefined && !value.startsWith("data:") && !value.startsWith("#"));
}

async function createImmutableSourceSnapshot(options: CompileVisualArtifactOptions): Promise<ImmutableSourceSnapshot> {
  if (typeof options.entryPath !== "string" || options.entryPath.length === 0) {
    fail("INVALID_ARTIFACT_REQUEST", "必须提供 entryPath");
  }
  if (options.exportName !== undefined && options.exportName !== "default") {
    fail("ARTIFACT_EXPORT_INVALID", "SDK ABI artifact 仅支持 default export");
  }
  if (options.subject !== undefined || options.dynamicSubjectProvider !== undefined) {
    fail("INVALID_ARTIFACT_REQUEST", "ReactNode 或函数不能传入 Artifact 编译 seam");
  }
  const requestedEntry = resolve(options.entryPath);
  const entryPath = await realpath(requestedEntry).catch(() => undefined);
  if (entryPath === undefined || !(await lstat(entryPath)).isFile()) {
    fail("ARTIFACT_ENTRY_NOT_FOUND", `artifact entry 不存在: ${requestedEntry}`);
  }
  const logicalSourceRoot = resolve(options.sourceRoot ?? dirname(requestedEntry));
  const sourceRoot = await canonicalDirectory(logicalSourceRoot, "sourceRoot");
  if (!isWithin(sourceRoot, entryPath)) {
    fail("ARTIFACT_SOURCE_OUTSIDE_ROOT", `artifact entry 位于 sourceRoot 之外: ${entryPath}`, { sourceRoot });
  }

  const collected = new Map<string, SourceGraphEntry>();
  const aliases = new Map<string, string>();
  let totalBytes = 0;
  const visit = async (path: string): Promise<void> => {
    const logical = resolve(path);
    const canonical = await realpath(logical).catch(() => undefined);
    if (canonical === undefined) fail("COMPONENT_IMPORT_NOT_FOUND", `artifact 依赖不存在: ${path}`);
    if (!isWithin(sourceRoot, canonical)) {
      fail("ARTIFACT_SOURCE_OUTSIDE_ROOT", `artifact 依赖位于 sourceRoot 之外: ${canonical}`, { sourceRoot });
    }
    if (!isWithin(logicalSourceRoot, logical) && !isWithin(sourceRoot, logical)) {
      fail("ARTIFACT_SOURCE_OUTSIDE_ROOT", `artifact 依赖路径位于 sourceRoot 之外: ${logical}`, { sourceRoot });
    }
    const logicalRelative = isWithin(logicalSourceRoot, logical)
      ? relative(logicalSourceRoot, logical)
      : relative(sourceRoot, logical);
    const canonicalRelative = relative(sourceRoot, canonical);
    if (logicalRelative !== canonicalRelative) aliases.set(logicalRelative, canonicalRelative);
    if (collected.has(canonical)) return;
    const file = await lstat(canonical);
    if (!file.isFile()) fail("ARTIFACT_SOURCE_OUTSIDE_ROOT", `artifact 依赖不是普通文件: ${canonical}`);
    if (file.size > SOURCE_FILE_BYTES) fail("SECURE_EXECUTION_LIMIT", `artifact 单文件超过 2 MiB: ${canonical}`);
    if (collected.size >= SOURCE_FILE_LIMIT) fail("SECURE_EXECUTION_LIMIT", "artifact 源文件超过 500 个");
    const bytes = new Uint8Array(await readFile(canonical));
    totalBytes += bytes.byteLength;
    if (totalBytes > SOURCE_TOTAL_BYTES) fail("SECURE_EXECUTION_LIMIT", "artifact 源码总计超过 16 MiB");
    collected.set(canonical, Object.freeze({
      sourcePath: canonical,
      relativePath: relative(sourceRoot, canonical),
      bytes,
      sha256: digest(bytes),
    }));

    const extension = extname(canonical).toLowerCase();
    const source = new TextDecoder().decode(bytes);
    if (extension === ".css") {
      if (/url\(\s*["']?(?:https?:|\/\/)/i.test(source) || /@import\s+["'](?:https?:|\/\/)/i.test(source)) {
        fail("UNSUPPORTED_DOM_TIMELINE_API", "受支持 SDK ABI CSS 不允许网络 URL", { entryPath: canonical });
      }
      for (const specifier of cssDependencies(source)) await visit(await resolveDomDependency(canonical, specifier));
      return;
    }
    if (!sourceExtensions.has(extension)) return;
    for (const [pattern, label] of forbiddenDomSource) {
      if (pattern.test(source)) {
        fail("UNSUPPORTED_DOM_TIMELINE_API", `受支持 SDK ABI artifact 不允许使用 ${label}`, { entryPath: canonical, api: label });
      }
    }
    if (/\brequire\s*\(/.test(source)) {
      fail("INVALID_COMPONENT_IMPORT", "SDK ABI artifact 不允许 CommonJS require", { importer: canonical });
    }
    const loader = extension === ".ts" || extension === ".mts" || extension === ".cts" ? "ts"
      : extension === ".js" || extension === ".mjs" || extension === ".cjs" ? "js"
      : extension === ".jsx" ? "jsx" : "tsx";
    for (const dependency of await scanModuleImports(source, loader)) {
      if (dependency.kind === "dynamic-import") {
        fail("INVALID_COMPONENT_IMPORT", "SDK ABI artifact 不允许 dynamic import", { importer: canonical, specifier: dependency.path });
      }
      if (dependency.path === undefined) {
        fail("INVALID_COMPONENT_IMPORT", "SDK ABI artifact import 必须使用静态字符串", { importer: canonical });
      } else if (dependency.path.startsWith(".")) {
        await visit(await resolveDomDependency(canonical, dependency.path));
      } else if (isReactRuntimeImport(dependency.path)) {
        fail("INVALID_COMPONENT_IMPORT", `SDK ABI artifact 必须从 @fourier-video/sdk 导入 React 能力: ${dependency.path}`, {
          importer: canonical,
          specifier: dependency.path,
        });
      } else if (!isSdkAuthorImport(dependency.path)) {
        fail("INVALID_COMPONENT_IMPORT", `SDK ABI artifact 不允许 bare import: ${dependency.path}`, {
          importer: canonical,
          specifier: dependency.path,
        });
      }
    }
  };
  await visit(requestedEntry);

  const temporaryRoot = await mkdtemp(join(tmpdir(), "fourier-artifact-snapshot-"));
  const snapshotRoot = join(temporaryRoot, "source");
  await mkdir(snapshotRoot, { recursive: true, mode: 0o700 });
  try {
    for (const dependency of collected.values()) {
      const target = join(snapshotRoot, dependency.relativePath);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, dependency.bytes, { mode: 0o400, flag: "wx" });
      await chmod(target, 0o400);
    }
    for (const [aliasRelative, targetRelative] of aliases) {
      const aliasPath = join(snapshotRoot, aliasRelative);
      const targetPath = join(snapshotRoot, targetRelative);
      await mkdir(dirname(aliasPath), { recursive: true, mode: 0o700 });
      await symlink(relative(dirname(aliasPath), targetPath), aliasPath);
    }
    const snapshotEntryRelative = isWithin(logicalSourceRoot, requestedEntry)
      ? relative(logicalSourceRoot, requestedEntry)
      : relative(sourceRoot, entryPath);
    return Object.freeze({
      sourceRoot,
      entryPath,
      snapshotEntryPath: join(snapshotRoot, snapshotEntryRelative),
      dependencies: Object.freeze([...collected.values()].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))),
      cleanup: () => rm(temporaryRoot, { recursive: true, force: true }),
    });
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

async function artifactProtocolSourcePath(): Promise<string> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const colocated = join(moduleDirectory, "artifact-protocol.ts");
  if (await access(colocated).then(() => true, () => false)) return colocated;
  return resolve(moduleDirectory, "../src/artifact-protocol.ts");
}

function inspectorBootstrapSource(entryPath: string, protocolPath: string): string {
  return `
import artifact from ${JSON.stringify(entryPath)};
import { assertSynchronousArtifactResult, bindSdkArtifactProps, readSdkArtifact } from ${JSON.stringify(protocolPath)};
const reply = (envelope) => globalThis.postMessage(JSON.stringify(envelope));
const clone = (value, label) => {
  let text;
  try { text = JSON.stringify(value); } catch { throw Object.assign(new Error(label + " 不是 JSON-safe 数据"), { code: "SECURE_EXECUTION_PROTOCOL_INVALID" }); }
  if (text === undefined) throw Object.assign(new Error(label + " 不是 JSON-safe 数据"), { code: "SECURE_EXECUTION_PROTOCOL_INVALID" });
  return JSON.parse(text);
};
globalThis.onmessage = (event) => {
  try {
    const input = JSON.parse(event.data);
    const metadata = readSdkArtifact(artifact);
    if (metadata === undefined) throw Object.assign(new Error("artifact 必须由 @fourier-video/sdk 定义"), { code: "ARTIFACT_EXPORT_INVALID" });
    const preview = assertSynchronousArtifactResult(metadata.designPreview(), metadata.name + ".designPreview()");
    if (typeof preview !== "object" || preview === null || Array.isArray(preview)) {
      throw Object.assign(new Error(metadata.name + ".designPreview() 必须返回对象"), { code: "INVALID_DESIGN_PREVIEW" });
    }
    if (metadata.kind === "shader" && (typeof preview.subject !== "string" || preview.subject.length === 0)) {
      throw Object.assign(new Error(metadata.name + ".designPreview().subject 必须是图片 URL 或 data URI"), { code: "INVALID_DESIGN_PREVIEW" });
    }
    const props = bindSdkArtifactProps(artifact, input.props ?? preview.props ?? {}, { fps: input.composition?.fps ?? 60 });
    const textSubject = input.textSubject ?? (
      metadata.kind === "motion" && metadata.supportsTextMotion && typeof preview.subject === "string" ? preview.subject : undefined
    );
    const designPreview = clone({
      composition: preview.composition,
      props: preview.props ?? {},
      ...(preview.fonts === undefined ? {} : { fonts: preview.fonts }),
      ...(preview.seed === undefined ? {} : { seed: preview.seed }),
      ...(preview.player === undefined ? {} : { player: preview.player }),
      ...(preview.motion === undefined ? {} : { motion: preview.motion }),
      ...(textSubject === undefined ? {} : { textSubject }),
    }, "designPreview");
    reply({ revision: 1, profile: "artifact-inspect", ok: true, value: clone({
      sdkAbiVersion: metadata.sdkAbiVersion,
      renderer: metadata.renderer,
      kind: metadata.kind,
      name: metadata.name,
      static: metadata.kind === "react" && metadata.static === true,
      ...(metadata.kind === "motion" && metadata.renderer === "dom-timeline" ? { supportsTextMotion: metadata.supportsTextMotion } : {}),
      ...(metadata.renderer === "dom-timeline-ffmpeg-video" ? { videoComposition: "ffmpeg" } : {}),
      designPreview,
      schema: metadata.schema,
      props,
    }, "artifact inspection") });
  } catch (error) {
    reply({ revision: 1, profile: "artifact-inspect", ok: false, error: {
      code: typeof error?.code === "string" ? error.code : "ARTIFACT_EXECUTION_FAILED",
      message: error instanceof Error ? error.message : String(error),
    } });
  }
};`;
}

async function inspectorBundle(entryPath: string, integration: ArtifactHostOptions): Promise<{ javascript: string; hash: string }> {
  const source = inspectorBootstrapSource(entryPath, await artifactProtocolSourcePath());
  try {
    const result = await buildSecureBrowserBundle({
      entryPoint: "fourier:artifact-inspector",
      plugins: [{
        name: "fourier-artifact-inspector-bootstrap",
        setup(build) {
          build.onResolve({ filter: /^fourier:artifact-inspector$/ }, () => ({ path: "artifact-inspector", namespace: "fourier" }));
          build.onLoad({ filter: /^artifact-inspector$/, namespace: "fourier" }, () => ({ contents: source, loader: "tsx" }));
        },
      }, imageAssetUrlPlugin("fourier-artifact-inspector-images"), authorRuntimeAliasPlugin(
        "fourier-artifact-inspector-runtime",
        integration.resolveAuthorImport,
      )],
    });
    const output = result.outputFiles?.find((candidate) => candidate.path.endsWith(".js"));
    if (output === undefined) fail("ARTIFACT_COMPILE_FAILED", "无法构建 artifact inspector bundle");
    const javascript = output.text;
    return Object.freeze({ javascript, hash: digest(javascript) });
  } catch (error) {
    if (error instanceof CoreError) throw error;
    fail("ARTIFACT_COMPILE_FAILED", formatBrowserBuildFailure(error));
  }
}

async function browserBundle(entryPath: string, integration: ArtifactHostOptions): Promise<BrowserBundleSnapshot> {
  const source = createDomBootstrapSource(entryPath);
  const imageAssets = new Map<string, BundledImageAsset>();
  try {
    const result = await buildSecureBrowserBundle({
      entryPoint: "fourier:dom-bootstrap",
      plugins: [{
        name: "fourier-dom-runtime-aliases",
        setup(build) {
          build.onResolve({ filter: /^fourier:dom-bootstrap$/ }, () => ({ path: "dom-bootstrap", namespace: "fourier" }));
          build.onLoad({ filter: /^dom-bootstrap$/, namespace: "fourier" }, () => ({ contents: source, loader: "tsx" }));
        },
      }, imageAssetUrlPlugin("fourier-dom-images", (asset) => imageAssets.set(asset.url, asset)), authorRuntimeAliasPlugin(
        "fourier-dom-author-runtime",
        integration.resolveAuthorImport,
        { reactDom: true },
      )],
    });
    let javascript = "";
    let css = "";
    for (const output of result.outputFiles ?? []) {
      if (output.path.endsWith(".js")) javascript += output.text;
      else if (output.path.endsWith(".css")) css += output.text;
    }
    if (javascript === "") fail("ARTIFACT_COMPILE_FAILED", "browser bundle 缺少 JavaScript output");
    const bundledImages = Object.freeze([...imageAssets.values()]);
    return Object.freeze({
      javascript,
      css,
      imageAssets: bundledImages,
      hash: digest(javascript, css, ...bundledImages.flatMap((asset) => [asset.url, asset.base64])),
    });
  } catch (error) {
    if (error instanceof CoreError) throw error;
    fail("ARTIFACT_COMPILE_FAILED", formatBrowserBuildFailure(error));
  }
}

function parseInspection(value: unknown): ArtifactInspection {
  const result = asRecord(value, "artifact inspection");
  assertOnlyKeys(result, [
    "sdkAbiVersion", "renderer", "kind", "name", "static", "supportsTextMotion", "videoComposition", "designPreview", "schema", "props",
  ], "artifact inspection");
  if (result.sdkAbiVersion !== 1 && result.sdkAbiVersion !== 1.1 && result.sdkAbiVersion !== 1.2) fail("SECURE_EXECUTION_PROTOCOL_INVALID", "sdkAbiVersion 无效");
  if (result.renderer !== "dom-timeline" && result.renderer !== "dom-timeline-ffmpeg-video") fail("SECURE_EXECUTION_PROTOCOL_INVALID", "renderer 无效");
  if (result.kind !== "react" && result.kind !== "motion" && result.kind !== "shader") fail("SECURE_EXECUTION_PROTOCOL_INVALID", "kind 无效");
  if (typeof result.name !== "string" || result.name.length === 0 || result.name.length > 256) fail("SECURE_EXECUTION_PROTOCOL_INVALID", "name 无效");
  if (typeof result.static !== "boolean") fail("SECURE_EXECUTION_PROTOCOL_INVALID", "static 无效");
  if (result.supportsTextMotion !== undefined && typeof result.supportsTextMotion !== "boolean") fail("SECURE_EXECUTION_PROTOCOL_INVALID", "supportsTextMotion 无效");
  if (result.videoComposition !== undefined && result.videoComposition !== "ffmpeg") fail("SECURE_EXECUTION_PROTOCOL_INVALID", "videoComposition 无效");
  const preview = asRecord(result.designPreview, "designPreview");
  assertOnlyKeys(preview, ["composition", "props", "fonts", "seed", "player", "motion", "textSubject"], "designPreview");
  asRecord(preview.composition, "designPreview.composition");
  asRecord(preview.props, "designPreview.props");
  const props = asRecord(result.props, "props");
  const schema = asRecord(result.schema, "schema") as Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  return Object.freeze({
    sdkAbiVersion: result.sdkAbiVersion,
    renderer: result.renderer,
    kind: result.kind,
    name: result.name,
    static: result.static,
    ...(result.supportsTextMotion === undefined ? {} : { supportsTextMotion: result.supportsTextMotion }),
    ...(result.videoComposition === undefined ? {} : { videoComposition: result.videoComposition }),
    designPreview: Object.freeze(preview) as unknown as CompiledArtifactDesignPreview,
    schema: Object.freeze(schema),
    props: Object.freeze(props),
  });
}

function resolveComposition(explicit: CompileVisualArtifactOptions["composition"], preview: CompiledArtifactDesignPreview): CompiledArtifactComposition {
  if (explicit !== undefined) {
    const fps = positiveInteger(explicit.fps, "composition.fps");
    return Object.freeze({
      width: positiveInteger(explicit.width, "composition.width"),
      height: positiveInteger(explicit.height, "composition.height"),
      fps,
      fpsSource: explicit.fpsSource ?? String(fps),
      durationInFrames: positiveInteger(explicit.durationInFrames, "composition.durationInFrames"),
    });
  }
  const source = asRecord(preview.composition, "designPreview.composition");
  assertOnlyKeys(source, ["width", "height", "durationSeconds", "fps"], "designPreview.composition");
  const width = positiveInteger(source.width, "designPreview.composition.width");
  const height = positiveInteger(source.height, "designPreview.composition.height");
  if (source.fps !== undefined && source.fps !== 60) {
    fail("DESIGN_PREVIEW_FPS_FIXED", "design preview fps 固定为 60，组件不能覆盖", { value: source.fps });
  }
  const durationSeconds = source.durationSeconds;
  if (!Number.isInteger(durationSeconds) || (durationSeconds as number) < 0 || (durationSeconds as number) > 30) {
    fail("INVALID_DESIGN_PREVIEW", "durationSeconds 必须是 0—30 的整数");
  }
  return Object.freeze({ width, height, fps: 60, fpsSource: "60", durationInFrames: durationSeconds === 0 ? 1 : (durationSeconds as number) * 60 });
}

function resolveModifier(
  explicit: CompileVisualArtifactOptions["modifier"] | CompileVisualArtifactOptions["motion"],
  preview?: CompiledArtifactDesignPreview["motion"],
): CompiledVisualArtifact["modifier"] {
  const source = explicit ?? preview;
  if (source === undefined) return undefined;
  const startFrame = source.startFrame ?? 0;
  const durationInFrames = source.durationInFrames ?? 1;
  const fill = source.fill ?? "both";
  if (!Number.isSafeInteger(startFrame) || startFrame < 0 || !Number.isSafeInteger(durationInFrames) || durationInFrames <= 0) {
    fail("INVALID_ARTIFACT_REQUEST", "modifier frame 范围无效");
  }
  if (!(["none", "forwards", "backwards", "both"] as const).includes(fill)) fail("INVALID_ARTIFACT_REQUEST", "modifier.fill 无效");
  return Object.freeze({ startFrame, durationInFrames, fill });
}

function fontMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  const text = new TextDecoder("latin1").decode(bytes.slice(0, 4));
  return ["wOFF", "wOF2", "OTTO", "true", "typ1"].includes(text) ||
    (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0);
}

async function compileFonts(
  sources: readonly { readonly family: string; readonly source: string }[],
  resourceRoots: readonly string[],
): Promise<readonly CompiledArtifactFont[]> {
  if (sources.length > FONT_COUNT_LIMIT) fail("SECURE_EXECUTION_LIMIT", "字体数量超过 16 个");
  const fonts: CompiledArtifactFont[] = [];
  let totalBytes = 0;
  for (const source of sources) {
    if (typeof source.family !== "string" || source.family.trim() === "" || typeof source.source !== "string" || source.source.length === 0) {
      fail("INVALID_ARTIFACT_FONT", "font.family/source 必须是非空字符串");
    }
    const requested = source.source.startsWith("file:") ? fileURLToPath(source.source) : source.source;
    const canonical = await realpath(resolve(requested)).catch(() => undefined);
    if (canonical === undefined || !(await lstat(canonical)).isFile()) fail("INVALID_ARTIFACT_FONT", `字体不是普通文件: ${requested}`);
    if (!resourceRoots.some((root) => isWithin(root, canonical))) fail("ARTIFACT_SOURCE_OUTSIDE_ROOT", `字体位于 resourceRoots 之外: ${canonical}`);
    const extension = extname(canonical).toLowerCase();
    if (![".woff", ".woff2", ".ttf", ".otf"].includes(extension)) fail("INVALID_ARTIFACT_FONT", `不支持字体扩展名: ${extension}`);
    const bytes = new Uint8Array(await readFile(canonical));
    if (bytes.byteLength > FONT_FILE_BYTES) fail("SECURE_EXECUTION_LIMIT", "单个字体超过 8 MiB");
    totalBytes += bytes.byteLength;
    if (totalBytes > FONT_TOTAL_BYTES) fail("SECURE_EXECUTION_LIMIT", "字体总计超过 32 MiB");
    if (!fontMagic(bytes)) fail("INVALID_ARTIFACT_FONT", `字体 magic 无效: ${canonical}`);
    const mime = extension === ".woff" ? "font/woff" : extension === ".woff2" ? "font/woff2" : extension === ".otf" ? "font/otf" : "font/ttf";
    fonts.push(Object.freeze({
      family: source.family,
      source: canonical,
      sha256: digest(bytes),
      dataUrl: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`,
    }));
  }
  return Object.freeze(fonts);
}

export async function compileVisualArtifact(
  options: CompileVisualArtifactOptions,
  integration: ArtifactHostOptions,
): Promise<CompiledVisualArtifact> {
  const immutable = await createImmutableSourceSnapshot(options).catch((error: unknown) => {
    if (error instanceof CoreError) throw error;
    throw new CoreError(
      "ARTIFACT_COMPILE_FAILED",
      error instanceof Error ? error.message : String(error),
    );
  });
  try {
    const resourceRoots = await Promise.all(
      (options.resourceRoots ?? [immutable.sourceRoot]).map((root) => canonicalDirectory(root, "resourceRoot")),
    );
    const [inspector, bundleSnapshot] = await Promise.all([
      inspectorBundle(immutable.snapshotEntryPath, integration),
      browserBundle(immutable.snapshotEntryPath, integration),
    ]);
    const inspection = parseInspection(await new SecureExecutionHost().execute({
      profile: "artifact-inspect",
      workerJavascript: inspector.javascript,
      input: Object.freeze({
        mode: options.mode ?? "design-preview",
        ...(options.props === undefined ? {} : { props: options.props }),
        ...(options.composition === undefined ? {} : { composition: options.composition }),
        ...(options.textSubject === undefined ? {} : { textSubject: options.textSubject }),
      }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    }));
    const composition = resolveComposition(options.composition, inspection.designPreview);
    const seed = options.seed ?? inspection.designPreview.seed ?? hashSeed(`${inspection.name}:artifact-preview`);
    if (!Number.isSafeInteger(seed) || seed < 0) fail("INVALID_ARTIFACT_REQUEST", "seed 必须是非负安全整数");
    const textSubject = options.textSubject ?? inspection.designPreview.textSubject;
    if (textSubject !== undefined && (inspection.kind !== "motion" || inspection.supportsTextMotion !== true)) {
      fail("TEXT_MOTION_UNSUPPORTED", `${inspection.name} 未声明支持 Text Motion`);
    }
    const previewFonts = inspection.designPreview.fonts ?? [];
    if (!Array.isArray(previewFonts)) fail("INVALID_ARTIFACT_FONT", "designPreview.fonts 必须是数组");
    const fonts = await compileFonts(options.fonts ?? previewFonts, resourceRoots);
    const dependencies = Object.freeze([
      ...immutable.dependencies.map((entry) => entry.sourcePath),
      ...fonts.map((font) => font.source),
    ]);
    const dependencyContents = [
      ...immutable.dependencies.map((entry) => ({ source: entry.sourcePath, sha256: entry.sha256 })),
      ...fonts.map((font) => ({ source: font.source, sha256: font.sha256 })),
    ];
    const propsDigest = digest(stableValue(inspection.props));
    const dependencyDigest = digest(stableValue(dependencyContents), inspector.hash, bundleSnapshot.hash);
    const modifier = resolveModifier(
      options.modifier ?? options.motion,
      inspection.kind === "motion" ? inspection.designPreview.motion : undefined,
    );
    const renderProfile = DOM_RENDER_PROFILE;
    // Production is the fail-safe compatibility default. Callers that want
    // author preview props/subject must opt in explicitly.
    const useDesignPreview = options.mode === "design-preview";
    const snapshotId = options.snapshotId ?? digest(
      inspection.name,
      String(inspection.sdkAbiVersion),
      propsDigest,
      dependencyDigest,
      renderProfile.hash,
      stableValue(composition),
      String(seed),
      stableValue(modifier ?? null),
      textSubject ?? "",
      useDesignPreview ? "design-preview" : "production",
    );
    return Object.freeze({
      sdkAbiVersion: inspection.sdkAbiVersion,
      renderer: inspection.renderer,
      kind: inspection.kind,
      name: inspection.name,
      snapshotId,
      entryPath: immutable.entryPath,
      bundleSnapshot,
      designPreview: inspection.designPreview,
      static: inspection.static,
      useDesignPreview,
      schema: inspection.schema,
      props: inspection.props,
      propsDigest,
      dependencies,
      dependencyDigest,
      composition,
      fonts,
      seed,
      renderProfile,
      ...(inspection.supportsTextMotion === undefined ? {} : { supportsTextMotion: inspection.supportsTextMotion }),
      ...(inspection.videoComposition === undefined ? {} : { videoComposition: inspection.videoComposition }),
      ...(modifier === undefined ? {} : { modifier }),
      ...(inspection.kind !== "motion" || modifier === undefined ? {} : { motion: modifier }),
      ...(textSubject === undefined ? {} : { textSubject }),
    });
  } catch (error) {
    if (error instanceof CoreError) throw error;
    throw new CoreError("ARTIFACT_EXECUTION_FAILED", error instanceof Error ? error.message : String(error));
  } finally {
    await immutable.cleanup();
  }
}
