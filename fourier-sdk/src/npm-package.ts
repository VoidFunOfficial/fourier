import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix } from "node:path";

import { loadWorldPackage, type LoadedWorldPackage } from "./world-manifest.ts";

export const MAX_NPM_PACKAGE_BYTES = 10 * 1024 * 1024;
export const MAX_NPM_UNPACKED_BYTES = 20 * 1024 * 1024;
export const MAX_NPM_PACKAGE_FILES = 500;
export const MAX_NPM_COMPONENTS = 50;

export interface NpmPackageReference {
  readonly packageUrl: string;
  readonly componentUrl?: string;
  readonly packageName: string;
  readonly namespace: string;
  readonly version: string;
  readonly componentName?: string;
}

export interface ResolvedNpmPackage {
  readonly reference: NpmPackageReference;
  readonly integrity: string;
  readonly tarballUrl: string;
  readonly fileCount: number;
  readonly unpackedSize: number;
  readonly rootDirectory: string;
  readonly components: readonly LoadedWorldPackage[];
  cleanup(): Promise<void>;
}

type Fetch = typeof globalThis.fetch;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function exactVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
}

export function parseNpmPackageReference(value: string): NpmPackageReference {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("npm 引用必须是精确版本 https://www.npmjs.com/package/@scope/name/v/1.2.3 URL");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.npmjs.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search
  ) {
    throw new TypeError("npm 引用只接受无认证、端口和查询参数的 https://www.npmjs.com 精确版本 URL");
  }
  const segments = url.pathname.split("/");
  if (
    segments.length !== 6 ||
    segments[0] !== "" ||
    segments[1] !== "package" ||
    !/^@[a-z0-9][a-z0-9._-]*$/.test(segments[2] ?? "") ||
    !/^[a-z0-9][a-z0-9._-]*$/.test(segments[3] ?? "") ||
    segments[4] !== "v" ||
    !exactVersion(segments[5] ?? "")
  ) {
    throw new TypeError("npm 引用必须是精确版本 https://www.npmjs.com/package/@scope/name/v/1.2.3 URL");
  }
  const componentName = url.hash ? url.hash.slice(1) : undefined;
  if (componentName !== undefined && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(componentName)) {
    throw new TypeError("npm 组件 fragment 必须是 ComponentName");
  }
  const namespace = segments[2]!;
  const packageName = `${namespace}/${segments[3]!}`;
  const version = segments[5]!;
  const packageUrl = `https://www.npmjs.com/package/${packageName}/v/${version}`;
  return Object.freeze({
    packageUrl,
    ...(componentName === undefined ? {} : { componentUrl: `${packageUrl}#${componentName}` }),
    packageName,
    namespace,
    version,
    ...(componentName === undefined ? {} : { componentName }),
  });
}

function safeArchivePath(value: string): string | undefined {
  if (!value.startsWith("package/") || value.includes("\\") || isAbsolute(value)) return undefined;
  const relative = value.slice("package/".length);
  if (!relative || posix.normalize(relative) !== relative || relative.split("/").includes("..")) return undefined;
  return relative;
}

function manifestPaths(value: unknown): readonly string[] {
  const root = record(value);
  const fourier = record(root?.fourier);
  const components = fourier?.components;
  if (fourier?.schemaVersion !== 1 || !Array.isArray(components)) {
    throw new TypeError("npm package.json 必须包含 fourier.schemaVersion: 1 和 fourier.components 数组");
  }
  if (components.length < 1 || components.length > MAX_NPM_COMPONENTS) {
    throw new TypeError(`fourier.components 必须包含 1—${MAX_NPM_COMPONENTS} 个组件 manifest`);
  }
  const paths = components.map((entry, index) => {
    if (
      typeof entry !== "string" ||
      !entry.endsWith("/package.json") ||
      entry.includes("\\") ||
      isAbsolute(entry) ||
      posix.normalize(entry) !== entry ||
      entry.split("/").includes("..")
    ) {
      throw new TypeError(`fourier.components[${index}] 必须是 package 内组件 package.json 的规范相对路径`);
    }
    return entry;
  });
  if (new Set(paths).size !== paths.length) throw new TypeError("fourier.components 不能包含重复路径");
  return Object.freeze(paths);
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function resolveNpmPackage(
  input: string,
  fetcher: Fetch = globalThis.fetch,
): Promise<ResolvedNpmPackage> {
  const reference = parseNpmPackageReference(input);
  const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(reference.packageName)}/${reference.version}`;
  const metadataResponse = await fetcher(metadataUrl, { headers: { accept: "application/json" }, redirect: "error" });
  const metadata = record(await responseBody(metadataResponse));
  if (!metadataResponse.ok) throw new TypeError(`npm registry 无法解析 ${reference.packageName}@${reference.version}`);
  const dist = record(metadata?.dist);
  if (
    metadata?.name !== reference.packageName ||
    metadata.version !== reference.version ||
    typeof dist?.tarball !== "string" ||
    typeof dist.integrity !== "string" ||
    !dist.integrity.startsWith("sha512-")
  ) {
    throw new TypeError("npm registry 精确版本元数据格式无效");
  }
  const tarballUrl = new URL(dist.tarball);
  if (tarballUrl.protocol !== "https:" || tarballUrl.hostname !== "registry.npmjs.org" || tarballUrl.port) {
    throw new TypeError("npm dist.tarball 必须位于官方 HTTPS registry");
  }
  if (
    typeof dist.fileCount === "number" &&
    (!Number.isInteger(dist.fileCount) || dist.fileCount < 1 || dist.fileCount > MAX_NPM_PACKAGE_FILES)
  ) {
    throw new TypeError(`npm package 文件数不能超过 ${MAX_NPM_PACKAGE_FILES}`);
  }
  if (
    typeof dist.unpackedSize === "number" &&
    (!Number.isInteger(dist.unpackedSize) || dist.unpackedSize < 1 || dist.unpackedSize > MAX_NPM_UNPACKED_BYTES)
  ) {
    throw new TypeError(`npm package 解压尺寸不能超过 ${MAX_NPM_UNPACKED_BYTES} bytes`);
  }

  const tarballResponse = await fetcher(tarballUrl, { redirect: "error" });
  if (!tarballResponse.ok) throw new TypeError("npm tarball 下载失败");
  const declaredLength = Number(tarballResponse.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_NPM_PACKAGE_BYTES) {
    throw new TypeError(`npm tarball 不能超过 ${MAX_NPM_PACKAGE_BYTES} bytes`);
  }
  const bytes = new Uint8Array(await tarballResponse.arrayBuffer());
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_NPM_PACKAGE_BYTES) {
    throw new TypeError(`npm tarball 必须为 1—${MAX_NPM_PACKAGE_BYTES} bytes`);
  }
  const actualIntegrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  if (actualIntegrity !== dist.integrity) throw new TypeError("npm tarball integrity 与 registry 元数据不一致");

  let files: Map<string, File>;
  try {
    files = await new Bun.Archive(bytes).files();
  } catch {
    throw new TypeError("npm tarball 无法解析");
  }
  if (files.size < 1 || files.size > MAX_NPM_PACKAGE_FILES) {
    throw new TypeError(`npm package 必须包含 1—${MAX_NPM_PACKAGE_FILES} 个文件`);
  }
  const unpackedSize = [...files.values()].reduce((total, file) => total + file.size, 0);
  if (unpackedSize < 1 || unpackedSize > MAX_NPM_UNPACKED_BYTES) {
    throw new TypeError(`npm package 解压尺寸不能超过 ${MAX_NPM_UNPACKED_BYTES} bytes`);
  }

  const rootDirectory = await mkdtemp(join(tmpdir(), "fourier-npm-package-"));
  try {
    for (const [archivePath, file] of files) {
      const path = safeArchivePath(archivePath);
      if (path === undefined) throw new TypeError(`npm tarball 包含无效路径: ${archivePath}`);
      const destination = join(rootDirectory, path);
      await mkdir(dirname(destination), { recursive: true });
      await Bun.write(destination, file);
    }
    const rootPackagePath = join(rootDirectory, "package.json");
    let rootPackage: unknown;
    try {
      rootPackage = JSON.parse(await Bun.file(rootPackagePath).text());
    } catch {
      throw new TypeError("npm tarball 根目录缺少有效 package.json");
    }
    const root = record(rootPackage);
    if (root?.name !== reference.packageName || root.version !== reference.version || root.license !== "MIT") {
      throw new TypeError("npm package.json 的 name、version 或 MIT license 与引用不一致");
    }
    const components = await Promise.all(manifestPaths(rootPackage).map((path) => loadWorldPackage(join(rootDirectory, path))));
    const names = new Set<string>();
    for (const component of components) {
      if (component.namespace !== reference.namespace || component.manifest.version !== reference.version) {
        throw new TypeError(`组件 ${component.manifest.name} 的 scope 或 version 与 npm package 不一致`);
      }
      if (names.has(component.componentName)) throw new TypeError(`npm package 包含重复组件 ${component.componentName}`);
      names.add(component.componentName);
    }
    if (reference.componentName !== undefined && !names.has(reference.componentName)) {
      throw new TypeError(`npm package 不包含组件 ${reference.componentName}`);
    }
    return Object.freeze({
      reference,
      integrity: dist.integrity,
      tarballUrl: tarballUrl.href,
      fileCount: files.size,
      unpackedSize,
      rootDirectory,
      components: Object.freeze(components),
      cleanup: () => rm(rootDirectory, { recursive: true, force: true }),
    });
  } catch (error) {
    await rm(rootDirectory, { recursive: true, force: true });
    throw error;
  }
}
