import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { emitDiagnostic, type DiagnosticTarget } from "./render-diagnostics.ts";
import type {
  PreparedTimelineArtifact,
  PreparedVisual,
} from "./visual-renderer.ts";
import type { TimelineVideoSurface } from "./visual-timeline-runtime.ts";

export const VISUAL_CACHE_SCHEMA = "fourier-visual-cache-v1" as const;

interface CachedFile {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

interface VisualCacheManifest {
  readonly schema: typeof VISUAL_CACHE_SCHEMA;
  readonly key: string;
  readonly nodeId: string;
  readonly type: "static" | "media";
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly timelineArtifacts: readonly PreparedTimelineArtifact[];
  readonly ffmpegVideo?: {
    readonly projections: readonly TimelineVideoSurface[];
    readonly maskPath: string;
  };
  readonly files: readonly CachedFile[];
}

function stableValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") {
    if (typeof value === "bigint") return `${value}n`;
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`)
    .join(",")}}`;
}

async function sha256(path: string): Promise<{ size: number; sha256: string }> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    const bytes = chunk as Buffer;
    size += bytes.byteLength;
    hash.update(bytes);
  }
  return { size, sha256: hash.digest("hex") };
}

function safeRelative(root: string, path: string): string {
  const value = relative(root, path);
  if (
    value === "" ||
    value === ".." ||
    value.startsWith(`..${sep}`) ||
    resolve(root, value) !== resolve(path)
  ) {
    throw new Error(`缓存文件不在条目目录内: ${path}`);
  }
  return value;
}

async function listFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name !== "manifest.json") files.push(path);
    }
  };
  await visit(directory);
  return files.sort();
}

function isFinitePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isTimelineArtifact(value: unknown): value is PreparedTimelineArtifact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const artifact = value as Partial<PreparedTimelineArtifact>;
  const profile = artifact.profile as Partial<PreparedTimelineArtifact["profile"]> | undefined;
  return typeof artifact.nodeId === "string" &&
    (artifact.kind === "react" || artifact.kind === "motion") &&
    typeof artifact.name === "string" &&
    artifact.sdkAbiVersion === 1 &&
    (artifact.renderer === "dom-timeline" ||
      artifact.renderer === "dom-timeline-ffmpeg-video") &&
    typeof artifact.snapshotId === "string" &&
    typeof artifact.dependencyDigest === "string" &&
    typeof profile === "object" &&
    profile !== null &&
    profile.adapter === "dom-timeline" &&
    typeof profile.platform === "string" &&
    typeof profile.hash === "string";
}

function isVideoSurface(value: unknown): value is TimelineVideoSurface {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const surface = value as Partial<TimelineVideoSurface>;
  return typeof surface.videoId === "string" &&
    typeof surface.cornerRadiusRatio === "number" &&
    Number.isFinite(surface.cornerRadiusRatio) &&
    Array.isArray(surface.corners) &&
    surface.corners.length === 4 &&
    surface.corners.every((corner) =>
      typeof corner === "object" &&
      corner !== null &&
      typeof corner.x === "number" &&
      Number.isFinite(corner.x) &&
      typeof corner.y === "number" &&
      Number.isFinite(corner.y)
    );
}

function isManifest(value: unknown, key: string): value is VisualCacheManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const manifest = value as Partial<VisualCacheManifest>;
  return manifest.schema === VISUAL_CACHE_SCHEMA &&
    manifest.key === key &&
    typeof manifest.nodeId === "string" &&
    (manifest.type === "static" || manifest.type === "media") &&
    typeof manifest.path === "string" &&
    isFinitePositiveInteger(manifest.width) &&
    isFinitePositiveInteger(manifest.height) &&
    isFinitePositiveInteger(manifest.frameCount) &&
    Array.isArray(manifest.timelineArtifacts) &&
    manifest.timelineArtifacts.every(isTimelineArtifact) &&
    Array.isArray(manifest.files) &&
    (manifest.ffmpegVideo === undefined || (
      manifest.type === "media" &&
      typeof manifest.ffmpegVideo === "object" &&
      manifest.ffmpegVideo !== null &&
      typeof manifest.ffmpegVideo.maskPath === "string" &&
      Array.isArray(manifest.ffmpegVideo.projections) &&
      manifest.ffmpegVideo.projections.length === manifest.frameCount &&
      manifest.ffmpegVideo.projections.every(isVideoSurface)
    ));
}

export class VisualContentDigester {
  readonly #projectRoot: string;
  readonly #files = new Map<string, Promise<string>>();

  constructor(projectRoot: string) {
    this.#projectRoot = resolve(projectRoot);
  }

  async file(path: string): Promise<string> {
    const absolute = resolve(path);
    let pending = this.#files.get(absolute);
    if (pending === undefined) {
      pending = sha256(absolute).then((result) => result.sha256);
      this.#files.set(absolute, pending);
    }
    return pending;
  }

  async digest(input: unknown, files: readonly string[] = []): Promise<string> {
    const hash = createHash("sha256");
    hash.update(VISUAL_CACHE_SCHEMA);
    hash.update(stableValue(input));
    for (const path of [...new Set(files.map((file) => resolve(file)))].sort()) {
      const logicalPath = relative(this.#projectRoot, path);
      hash.update(logicalPath);
      hash.update(await this.file(path));
    }
    return hash.digest("hex");
  }
}

export class VisualCache {
  readonly #root: string;
  readonly #diagnostics: DiagnosticTarget;
  readonly #persistent: boolean;

  constructor(
    projectRoot: string,
    diagnostics: DiagnosticTarget = {},
    persistent = true,
  ) {
    this.#root = join(resolve(projectRoot), ".render-cache", "visuals", "v1");
    this.#diagnostics = diagnostics;
    this.#persistent = persistent;
  }

  entryPath(key: string): string {
    return join(this.#root, key);
  }

  async createStaging(key: string): Promise<string> {
    const path = join(this.#root, ".staging", `${key}-${randomUUID()}`);
    await mkdir(path, { recursive: true });
    return path;
  }

  async #quarantine(key: string, entry: string, reason: string): Promise<void> {
    const quarantine = join(this.#root, ".corrupt", `${key}-${randomUUID()}`);
    await mkdir(dirname(quarantine), { recursive: true });
    try {
      await rename(entry, quarantine);
      await rm(quarantine, { recursive: true, force: true }).catch(() => {});
    } catch {
      // Another renderer may already have replaced or quarantined the entry.
    }
    emitDiagnostic(this.#diagnostics, {
      phase: "preparing",
      scope: `visual-cache/${key}`,
      status: "info",
      message: "视觉缓存条目损坏，已隔离并重新生成",
      details: { key, reason },
    });
  }

  async load(key: string, reportHit = true): Promise<PreparedVisual | undefined> {
    if (!this.#persistent) return undefined;
    const entry = this.entryPath(key);
    const manifestPath = join(entry, "manifest.json");
    if (!(await Bun.file(manifestPath).exists())) {
      if (existsSync(entry)) {
        await this.#quarantine(key, entry, "manifest 缺失");
      }
      return undefined;
    }
    try {
      const value = await Bun.file(manifestPath).json();
      if (!isManifest(value, key)) throw new Error("manifest schema 或内容键无效");
      const manifest = value;
      const declared = new Set<string>();
      for (const file of manifest.files) {
        if (
          typeof file?.path !== "string" ||
          !Number.isSafeInteger(file.size) ||
          file.size < 0 ||
          typeof file.sha256 !== "string"
        ) throw new Error("manifest 文件记录无效");
        const path = join(entry, file.path);
        if (safeRelative(entry, path) !== file.path) throw new Error("manifest 文件路径越界");
        const actual = await sha256(path);
        if (actual.size !== file.size || actual.sha256 !== file.sha256) {
          throw new Error(`缓存文件校验失败: ${file.path}`);
        }
        declared.add(file.path);
      }
      const actualFiles = (await listFiles(entry)).map((path) => safeRelative(entry, path));
      if (
        actualFiles.length !== declared.size ||
        actualFiles.some((path) => !declared.has(path))
      ) throw new Error("缓存文件集合与 manifest 不一致");
      const path = join(entry, manifest.path);
      const visualPath = safeRelative(entry, path.replace("%08d", "00000000"));
      if (!declared.has(visualPath)) throw new Error("视觉媒体未在 manifest 文件集合中声明");
      const maskPath = manifest.ffmpegVideo === undefined
        ? undefined
        : join(entry, manifest.ffmpegVideo.maskPath);
      if (maskPath !== undefined) {
        const maskRelative = safeRelative(
          entry,
          maskPath.replace("%08d", "00000000"),
        );
        if (!declared.has(maskRelative)) {
          throw new Error("视频 Motion mask 未在 manifest 文件集合中声明");
        }
      }
      const visual: PreparedVisual = {
        nodeId: manifest.nodeId,
        type: manifest.type,
        path,
        width: manifest.width,
        height: manifest.height,
        cacheKey: key,
        ...(manifest.timelineArtifacts.length === 0
          ? {}
          : { timelineArtifacts: Object.freeze(manifest.timelineArtifacts) }),
        ...(manifest.ffmpegVideo === undefined
          ? {}
          : {
              ffmpegVideo: Object.freeze({
                projections: Object.freeze(manifest.ffmpegVideo.projections),
                maskPath: maskPath!,
              }),
            }),
      };
      if (reportHit) {
        emitDiagnostic(this.#diagnostics, {
          phase: "preparing",
          scope: `visual-cache/${manifest.nodeId}`,
          status: "cache-hit",
          message: `复用视觉缓存 ${manifest.nodeId}`,
          details: { key, entry, frames: manifest.frameCount },
        });
      }
      return visual;
    } catch (error) {
      await this.#quarantine(
        key,
        entry,
        error instanceof Error ? error.message : String(error),
      );
      return undefined;
    }
  }

  async commit(input: {
    key: string;
    staging: string;
    visual: PreparedVisual;
    frameCount: number;
  }): Promise<PreparedVisual> {
    if (!this.#persistent) {
      return { ...input.visual, cacheKey: input.key };
    }
    if (input.visual.type === "sequence") {
      throw new Error("持久视觉缓存禁止提交逐帧图片序列");
    }
    const staging = resolve(input.staging);
    const files = await Promise.all((await listFiles(staging)).map(async (path) => ({
      path: safeRelative(staging, path),
      ...(await sha256(path)),
    })));
    const manifest: VisualCacheManifest = {
      schema: VISUAL_CACHE_SCHEMA,
      key: input.key,
      nodeId: input.visual.nodeId,
      type: input.visual.type,
      path: safeRelative(staging, input.visual.path.replace("%08d", "00000000"))
        .replace("00000000", "%08d"),
      width: input.visual.width,
      height: input.visual.height,
      frameCount: input.frameCount,
      timelineArtifacts: input.visual.timelineArtifacts ?? [],
      ...(input.visual.ffmpegVideo === undefined
        ? {}
        : {
            ffmpegVideo: {
              projections: input.visual.ffmpegVideo.projections,
              maskPath: safeRelative(
                staging,
                input.visual.ffmpegVideo.maskPath.replace("%08d", "00000000"),
              ).replace("00000000", "%08d"),
            },
          }),
      files,
    };
    await Bun.write(join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const destination = this.entryPath(input.key);
    await mkdir(dirname(destination), { recursive: true });
    try {
      await rename(staging, destination);
    } catch (error) {
      const winner = await this.load(input.key);
      if (winner !== undefined) {
        await rm(staging, { recursive: true, force: true }).catch(() => {});
        return winner;
      }
      throw error;
    }
    const committed = await this.load(input.key, false);
    if (committed === undefined) throw new Error(`视觉缓存提交后校验失败: ${input.key}`);
    emitDiagnostic(this.#diagnostics, {
      phase: "preparing",
      scope: `visual-cache/${input.visual.nodeId}`,
      status: "complete",
      message: `已提交视觉缓存 ${input.visual.nodeId}`,
      details: { key: input.key, entry: destination, frames: input.frameCount },
    });
    return committed;
  }

  async discard(staging: string): Promise<void> {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}
