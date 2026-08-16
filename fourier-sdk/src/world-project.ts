import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { FourierWorldClient, type DownloadedWorldPackage } from "./world-client.ts";
import { parseWorldPackageName } from "./world-manifest.ts";
import { MAX_WORLD_ARCHIVE_FILES, MAX_WORLD_ARCHIVE_UNPACKED_BYTES } from "./world-archive.ts";

export const WORLD_PROJECT_LOCK = ".fourier-world.json";

export interface InstalledWorldComponent {
  readonly version: string;
  readonly path: string;
  readonly worldUrl: string;
  readonly sha256: string;
  readonly installedAt: string;
}

export interface WorldProjectLock {
  readonly version: 1;
  readonly components: Readonly<Record<string, InstalledWorldComponent>>;
}

export interface AddWorldComponentResult {
  readonly packageName: string;
  readonly version: string;
  readonly path: string;
  readonly unchanged: boolean;
}

export interface DeleteWorldComponentResult {
  readonly packageName: string;
  readonly path: string;
  readonly trashPath?: string;
  readonly missing: boolean;
}

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path.length === 0 || (!path.startsWith("..") && !isAbsolute(path));
}

function portablePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function installedComponent(value: unknown): value is InstalledWorldComponent {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<InstalledWorldComponent>;
  return (
    typeof item.version === "string" &&
    typeof item.path === "string" &&
    typeof item.worldUrl === "string" &&
    typeof item.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(item.sha256) &&
    typeof item.installedAt === "string"
  );
}

async function readLock(projectDirectory: string): Promise<WorldProjectLock> {
  const path = join(projectDirectory, WORLD_PROJECT_LOCK);
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Object.freeze({ version: 1, components: Object.freeze({}) });
    }
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new TypeError(`项目安装清单不是有效 JSON: ${path}`);
  }
  if (typeof value !== "object" || value === null) throw new TypeError(`项目安装清单格式无效: ${path}`);
  const item = value as { version?: unknown; components?: unknown };
  if (item.version !== 1 || typeof item.components !== "object" || item.components === null || Array.isArray(item.components)) {
    throw new TypeError(`项目安装清单格式无效: ${path}`);
  }
  const components: Record<string, InstalledWorldComponent> = {};
  for (const [packageName, component] of Object.entries(item.components)) {
    parseWorldPackageName(packageName);
    if (!installedComponent(component)) throw new TypeError(`项目安装清单中的 ${packageName} 格式无效`);
    components[packageName] = Object.freeze({ ...component });
  }
  return Object.freeze({ version: 1, components: Object.freeze(components) });
}

async function writeLock(projectDirectory: string, components: Record<string, InstalledWorldComponent>): Promise<void> {
  const path = join(projectDirectory, WORLD_PROJECT_LOCK);
  const temporaryPath = join(projectDirectory, `.${WORLD_PROJECT_LOCK}-${process.pid}-${randomUUID()}.tmp`);
  const sorted = Object.fromEntries(Object.entries(components).sort(([left], [right]) => left.localeCompare(right)));
  try {
    await writeFile(temporaryPath, `${JSON.stringify({ version: 1, components: sorted }, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function existingDirectory(path: string, label: string): Promise<string> {
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new TypeError(`${label}不存在: ${path}`);
    throw error;
  }
  if (!info.isDirectory()) throw new TypeError(`${label}必须是目录: ${path}`);
  return realpath(path);
}

async function validateArchive(download: DownloadedWorldPackage): Promise<Map<string, File>> {
  const archive = new Bun.Archive(download.bytes);
  let files: Map<string, File>;
  try {
    files = await archive.files();
  } catch (error) {
    throw new TypeError(`Fourier World 组件包损坏: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (files.size === 0 || files.size > MAX_WORLD_ARCHIVE_FILES) {
    throw new TypeError(`Fourier World 组件包文件数必须是 1—${MAX_WORLD_ARCHIVE_FILES}`);
  }
  let unpackedSize = 0;
  for (const [path, file] of files) {
    const portable = portablePath(path);
    const segments = portable.split("/");
    if (
      portable !== path ||
      isAbsolute(path) ||
      segments.includes("..") ||
      segments.includes("") ||
      segments.includes(".git") ||
      segments.includes("node_modules")
    ) {
      throw new TypeError(`Fourier World 组件包包含不安全路径: ${path}`);
    }
    unpackedSize += file.size;
  }
  if (unpackedSize > MAX_WORLD_ARCHIVE_UNPACKED_BYTES) {
    throw new TypeError(`Fourier World 组件包解压尺寸超过 ${MAX_WORLD_ARCHIVE_UNPACKED_BYTES} bytes`);
  }
  const packageFile = files.get("package.json");
  if (packageFile === undefined) throw new TypeError("Fourier World 组件包缺少 package.json");
  let packageJson: unknown;
  try {
    packageJson = JSON.parse(await packageFile.text());
  } catch {
    throw new TypeError("Fourier World 组件包中的 package.json 无效");
  }
  const item = packageJson as { name?: unknown; version?: unknown };
  if (item?.name !== download.packageName || item.version !== download.version) {
    throw new TypeError("Fourier World 下载元数据与归档 package.json 不一致");
  }
  return files;
}

async function writeArchiveFiles(files: Map<string, File>, targetDirectory: string): Promise<void> {
  for (const [path, file] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    const target = resolve(targetDirectory, path);
    if (!isInside(targetDirectory, target)) throw new TypeError(`组件包路径逃逸目标目录: ${path}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, new Uint8Array(await file.arrayBuffer()), { mode: 0o644 });
  }
}

export async function addWorldComponent(options: {
  readonly packageName: string;
  readonly projectDirectory?: string;
  readonly componentsDirectory?: string;
  readonly worldUrl: string;
  readonly force?: boolean;
  readonly fetch?: typeof globalThis.fetch;
}): Promise<AddWorldComponentResult> {
  const identity = parseWorldPackageName(options.packageName);
  const projectDirectory = await existingDirectory(resolve(options.projectDirectory ?? process.cwd()), "项目目录");
  const componentsDirectory = resolve(projectDirectory, options.componentsDirectory ?? "components");
  if (!isInside(projectDirectory, componentsDirectory)) throw new TypeError("组件目录必须位于项目目录内");
  const lock = await readLock(projectDirectory);
  const existing = lock.components[options.packageName];
  const targetDirectory = existing === undefined
    ? resolve(componentsDirectory, identity.namespace, identity.componentName)
    : resolve(projectDirectory, existing.path);
  if (!isInside(projectDirectory, targetDirectory) || targetDirectory === projectDirectory) {
    throw new TypeError("组件安装路径无效");
  }
  const client = new FourierWorldClient({
    worldUrl: options.worldUrl,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const download = await client.download(options.packageName);
  if (existing?.sha256 === download.sha256) {
    try {
      const installedPath = resolve(projectDirectory, existing.path);
      const info = await stat(installedPath);
      const localPackage = JSON.parse(await readFile(join(installedPath, "package.json"), "utf8")) as {
        name?: unknown;
        version?: unknown;
      };
      if (
        info.isDirectory() &&
        localPackage.name === options.packageName &&
        localPackage.version === existing.version
      ) {
        return Object.freeze({
          packageName: options.packageName,
          version: existing.version,
          path: installedPath,
          unchanged: true,
        });
      }
    } catch {
      // Reinstall a missing or damaged managed directory below.
    }
  }
  const files = await validateArchive(download);
  await mkdir(dirname(targetDirectory), { recursive: true });
  const stagingDirectory = join(dirname(targetDirectory), `.fourier-add-${randomUUID()}`);
  const backupDirectory = join(dirname(targetDirectory), `.fourier-backup-${randomUUID()}`);
  await mkdir(stagingDirectory, { mode: 0o700 });
  let hadTarget = false;
  try {
    await writeArchiveFiles(files, stagingDirectory);
    try {
      const info = await stat(targetDirectory);
      hadTarget = info.isDirectory() || info.isFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (hadTarget && !options.force && (existing === undefined || existing.sha256 === download.sha256)) {
      throw new TypeError(`目标目录已存在: ${targetDirectory}；如需替换请显式使用 --force`);
    }
    if (hadTarget) await rename(targetDirectory, backupDirectory);
    try {
      await rename(stagingDirectory, targetDirectory);
    } catch (error) {
      if (hadTarget) await rename(backupDirectory, targetDirectory).catch(() => undefined);
      throw error;
    }

    const components = { ...lock.components };
    components[options.packageName] = Object.freeze({
      version: download.version,
      path: portablePath(relative(projectDirectory, targetDirectory)),
      worldUrl: client.worldUrl,
      sha256: download.sha256,
      installedAt: new Date().toISOString(),
    });
    try {
      await writeLock(projectDirectory, components);
    } catch (error) {
      await rm(targetDirectory, { recursive: true, force: true });
      if (hadTarget) await rename(backupDirectory, targetDirectory);
      throw error;
    }
    if (hadTarget) await rm(backupDirectory, { recursive: true, force: true }).catch(() => undefined);
    return Object.freeze({
      packageName: options.packageName,
      version: download.version,
      path: targetDirectory,
      unchanged: false,
    });
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function deleteWorldComponent(options: {
  readonly packageName: string;
  readonly projectDirectory?: string;
  readonly purge?: boolean;
}): Promise<DeleteWorldComponentResult> {
  parseWorldPackageName(options.packageName);
  const projectDirectory = await existingDirectory(resolve(options.projectDirectory ?? process.cwd()), "项目目录");
  const lock = await readLock(projectDirectory);
  const installed = lock.components[options.packageName];
  if (installed === undefined) throw new TypeError(`${options.packageName} 不在 ${WORLD_PROJECT_LOCK} 中，拒绝删除未管理目录`);
  const targetDirectory = resolve(projectDirectory, installed.path);
  if (!isInside(projectDirectory, targetDirectory) || targetDirectory === projectDirectory) {
    throw new TypeError(`安装清单中的组件路径不安全: ${installed.path}`);
  }
  let exists = true;
  try {
    await stat(targetDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") exists = false;
    else throw error;
  }

  if (exists) {
    let localPackage: unknown;
    try {
      localPackage = JSON.parse(await readFile(join(targetDirectory, "package.json"), "utf8"));
    } catch {
      throw new TypeError(`已安装目录缺少有效 package.json，拒绝删除: ${targetDirectory}`);
    }
    if ((localPackage as { name?: unknown }).name !== options.packageName) {
      throw new TypeError(`已安装目录的 package name 不匹配，拒绝删除: ${targetDirectory}`);
    }
  }

  const components = { ...lock.components };
  delete components[options.packageName];
  let trashPath: string | undefined;
  if (exists && !options.purge) {
    const trashDirectory = join(projectDirectory, ".fourier-trash");
    await mkdir(trashDirectory, { recursive: true });
    const safeName = options.packageName.replace(/^@/, "").replace("/", "-");
    trashPath = join(trashDirectory, `${safeName}-${installed.version}-${Date.now()}`);
    await rename(targetDirectory, trashPath);
  } else if (exists) {
    await rm(targetDirectory, { recursive: true });
  }
  try {
    await writeLock(projectDirectory, components);
  } catch (error) {
    if (trashPath !== undefined) await rename(trashPath, targetDirectory).catch(() => undefined);
    throw error;
  }
  return Object.freeze({
    packageName: options.packageName,
    path: targetDirectory,
    ...(trashPath === undefined ? {} : { trashPath }),
    missing: !exists,
  });
}
