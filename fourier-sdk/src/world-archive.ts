import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import type { LoadedWorldPackage } from "./world-manifest.ts";

export const MAX_WORLD_ARCHIVE_BYTES = 10 * 1024 * 1024;
export const MAX_WORLD_ARCHIVE_UNPACKED_BYTES = 20 * 1024 * 1024;
export const MAX_WORLD_ARCHIVE_FILES = 500;

export interface WorldPackageArchive {
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly fileCount: number;
  readonly unpackedSize: number;
}

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path.length === 0 || (!path.startsWith("..") && !isAbsolute(path));
}

function archivePath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function assertPublishablePath(path: string): void {
  const segments = path.split("/");
  if (segments.includes(".git") || segments.includes("node_modules")) {
    throw new TypeError(`组件包不能包含 ${path}`);
  }
  const filename = basename(path).toLowerCase();
  if (filename === ".env" || filename.startsWith(".env.")) {
    throw new TypeError(`组件包不能包含环境变量文件 ${path}`);
  }
}

async function collectFilePaths(
  componentPackage: LoadedWorldPackage,
): Promise<Map<string, string>> {
  const root = await realpath(componentPackage.rootDirectory);
  const files = new Map<string, string>();

  const visit = async (candidate: string): Promise<void> => {
    const info = await lstat(candidate);
    if (info.isSymbolicLink()) throw new TypeError(`组件包不允许符号链接: ${archivePath(root, candidate)}`);
    const candidateRealPath = await realpath(candidate);
    if (!isInside(root, candidateRealPath)) throw new TypeError("组件包文件不能位于 package.json 目录之外");
    if (info.isDirectory()) {
      const children = await readdir(candidateRealPath);
      children.sort((left, right) => left.localeCompare(right));
      for (const child of children) await visit(resolve(candidateRealPath, child));
      return;
    }
    if (!info.isFile()) throw new TypeError(`组件包只支持普通文件: ${archivePath(root, candidateRealPath)}`);
    const path = archivePath(root, candidateRealPath);
    assertPublishablePath(path);
    files.set(path, candidateRealPath);
    if (files.size > MAX_WORLD_ARCHIVE_FILES) {
      throw new TypeError(`组件包文件数不能超过 ${MAX_WORLD_ARCHIVE_FILES}`);
    }
  };

  await visit(componentPackage.packagePath);
  for (const declaredPath of componentPackage.manifest.files) {
    const path = resolve(root, declaredPath);
    if (!isInside(root, path)) throw new TypeError(`files 路径逃逸 package 目录: ${declaredPath}`);
    try {
      await visit(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new TypeError(`files 声明的路径不存在: ${declaredPath}`);
      }
      throw error;
    }
  }
  return files;
}

export async function createWorldPackageArchive(
  componentPackage: LoadedWorldPackage,
  dependencies: readonly string[],
): Promise<WorldPackageArchive> {
  const root = await realpath(componentPackage.rootDirectory);
  const paths = await collectFilePaths(componentPackage);
  for (const dependency of dependencies) {
    const realDependency = await realpath(dependency);
    if (!isInside(root, realDependency)) {
      throw new TypeError(`artifact 依赖位于组件 package 之外: ${dependency}`);
    }
    const path = archivePath(root, realDependency);
    if (!paths.has(path)) {
      throw new TypeError(`artifact 依赖未包含在 package.json files 中: ${path}`);
    }
  }

  const archiveFiles: Record<string, Uint8Array> = {};
  let unpackedSize = 0;
  for (const [path, absolutePath] of [...paths].sort(([left], [right]) => left.localeCompare(right))) {
    const bytes = await readFile(absolutePath);
    unpackedSize += bytes.byteLength;
    if (unpackedSize > MAX_WORLD_ARCHIVE_UNPACKED_BYTES) {
      throw new TypeError(`组件包解压尺寸不能超过 ${MAX_WORLD_ARCHIVE_UNPACKED_BYTES} bytes`);
    }
    archiveFiles[path] = bytes;
  }
  const bytes = await new Bun.Archive(archiveFiles, { compress: "gzip", level: 9 }).bytes();
  if (bytes.byteLength > MAX_WORLD_ARCHIVE_BYTES) {
    throw new TypeError(`组件包归档不能超过 ${MAX_WORLD_ARCHIVE_BYTES} bytes`);
  }
  return Object.freeze({
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    fileCount: paths.size,
    unpackedSize,
  });
}
