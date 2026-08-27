import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { FourierWorldClient } from "./world-client.ts";
import { parseNpmPackageReference, resolveNpmPackage } from "./npm-package.ts";
import type { LoadedWorldPackage } from "./world-manifest.ts";

export const WORLD_PROJECT_LOCK = ".fourier-world.json";

export interface InstalledWorldComponent {
  readonly version: string;
  readonly path: string;
  readonly worldUrl: string;
  readonly npmPackageUrl: string;
  readonly npmComponentUrl: string;
  readonly integrity: string;
  readonly installedAt: string;
}

export interface WorldProjectLock {
  readonly version: 2;
  readonly components: Readonly<Record<string, InstalledWorldComponent>>;
}

export interface AddedWorldComponent {
  readonly packageName: string;
  readonly version: string;
  readonly path: string;
  readonly unchanged: boolean;
}

export interface AddWorldPackageResult {
  readonly npmPackageUrl: string;
  readonly components: readonly AddedWorldComponent[];
}

export interface DeletedWorldComponent {
  readonly packageName: string;
  readonly path: string;
  readonly trashPath?: string;
  readonly missing: boolean;
}

export interface DeleteWorldPackageResult {
  readonly npmPackageUrl: string;
  readonly components: readonly DeletedWorldComponent[];
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
  if (
    typeof item.version !== "string" ||
    typeof item.path !== "string" ||
    typeof item.worldUrl !== "string" ||
    typeof item.npmPackageUrl !== "string" ||
    typeof item.npmComponentUrl !== "string" ||
    typeof item.integrity !== "string" ||
    !item.integrity.startsWith("sha512-") ||
    typeof item.installedAt !== "string"
  ) return false;
  try {
    const packageReference = parseNpmPackageReference(item.npmPackageUrl);
    const componentReference = parseNpmPackageReference(item.npmComponentUrl);
    return packageReference.componentName === undefined && componentReference.packageUrl === packageReference.packageUrl;
  } catch {
    return false;
  }
}

async function readLock(projectDirectory: string): Promise<WorldProjectLock> {
  const path = join(projectDirectory, WORLD_PROJECT_LOCK);
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Object.freeze({ version: 2, components: Object.freeze({}) });
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
  if (item.version === 1) throw new TypeError(`${WORLD_PROJECT_LOCK} v1 没有 npm 来源；请删除旧组件后用精确 npm URL 重新安装`);
  if (item.version !== 2 || typeof item.components !== "object" || item.components === null || Array.isArray(item.components)) {
    throw new TypeError(`项目安装清单格式无效: ${path}`);
  }
  const components: Record<string, InstalledWorldComponent> = {};
  for (const [packageName, component] of Object.entries(item.components)) {
    if (!/^@[a-z0-9][a-z0-9._-]*\/[A-Za-z][A-Za-z0-9_-]*$/.test(packageName) || !installedComponent(component)) {
      throw new TypeError(`项目安装清单中的 ${packageName} 格式无效`);
    }
    const reference = parseNpmPackageReference(component.npmComponentUrl);
    if (reference.componentName === undefined || `${reference.namespace}/${reference.componentName}` !== packageName || reference.version !== component.version) {
      throw new TypeError(`项目安装清单中的 ${packageName} npm 身份不一致`);
    }
    components[packageName] = Object.freeze({ ...component });
  }
  return Object.freeze({ version: 2, components: Object.freeze(components) });
}

async function writeLock(projectDirectory: string, components: Record<string, InstalledWorldComponent>): Promise<void> {
  const path = join(projectDirectory, WORLD_PROJECT_LOCK);
  const temporaryPath = join(projectDirectory, `.${WORLD_PROJECT_LOCK}-${process.pid}-${randomUUID()}.tmp`);
  const sorted = Object.fromEntries(Object.entries(components).sort(([left], [right]) => left.localeCompare(right)));
  try {
    await writeFile(temporaryPath, `${JSON.stringify({ version: 2, components: sorted }, null, 2)}\n`, { mode: 0o600 });
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

async function assertManagedTarget(projectDirectory: string, target: string): Promise<void> {
  if (!isInside(projectDirectory, target) || target === projectDirectory) throw new TypeError("组件安装路径无效");
  let candidate = target;
  while (true) {
    try {
      if (!isInside(projectDirectory, await realpath(candidate))) throw new TypeError("组件安装路径不能通过符号链接逃逸项目目录");
      return;
    } catch (error) {
      if (error instanceof TypeError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(candidate);
      if (parent === candidate) throw new TypeError("组件安装路径无效");
      candidate = parent;
    }
  }
}

async function copyComponent(component: LoadedWorldPackage, target: string): Promise<void> {
  await mkdir(target, { recursive: true, mode: 0o700 });
  await cp(component.packagePath, join(target, "package.json"));
  for (const declared of component.manifest.files) {
    const source = resolve(component.rootDirectory, declared);
    if (!isInside(component.rootDirectory, source)) throw new TypeError(`组件 files 路径逃逸: ${declared}`);
    await cp(source, resolve(target, declared), { recursive: true });
  }
}

export async function addWorldComponent(options: {
  readonly npmUrl: string;
  readonly projectDirectory?: string;
  readonly componentsDirectory?: string;
  readonly worldUrl: string;
  readonly force?: boolean;
  readonly fetch?: typeof globalThis.fetch;
}): Promise<AddWorldPackageResult> {
  const reference = parseNpmPackageReference(options.npmUrl);
  const projectDirectory = await existingDirectory(resolve(options.projectDirectory ?? process.cwd()), "项目目录");
  const componentsDirectory = resolve(projectDirectory, options.componentsDirectory ?? "components");
  if (!isInside(projectDirectory, componentsDirectory)) throw new TypeError("组件目录必须位于项目目录内");
  const lock = await readLock(projectDirectory);
  const client = new FourierWorldClient({
    worldUrl: options.worldUrl,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const approved = await client.approvedNpmPackage(options.npmUrl);
  const npmPackage = await resolveNpmPackage(options.npmUrl, options.fetch ?? globalThis.fetch);
  try {
    if (npmPackage.integrity !== approved.integrity) throw new TypeError("Fourier World 批准的 integrity 与 npm registry 不一致");
    const selected = npmPackage.components.filter((component) =>
      reference.componentName === undefined ? true : component.componentName === reference.componentName);
    if (selected.length === 0) throw new TypeError("npm package 没有可安装组件");
    const approvedNames = new Set(approved.components.map((component) => component.name));
    if (selected.some((component) => !approvedNames.has(component.componentName))) {
      throw new TypeError("npm package 包含 Fourier World 未批准的组件");
    }

    const selectedNames = new Set(selected.map((component) => component.manifest.name));
    const obsoleteEntries = reference.componentName === undefined
      ? Object.entries(lock.components).filter(([packageName, installed]) =>
          parseNpmPackageReference(installed.npmPackageUrl).packageName === reference.packageName &&
          !selectedNames.has(packageName))
      : [];
    const obsolete = await Promise.all(obsoleteEntries.map(async ([packageName, installed]) => {
      const target = resolve(projectDirectory, installed.path);
      await assertManagedTarget(projectDirectory, target);
      let exists = true;
      try {
        await stat(target);
        const local = JSON.parse(await readFile(join(target, "package.json"), "utf8")) as { name?: unknown };
        if (local.name !== packageName) throw new TypeError(`已安装目录的 package name 不匹配，拒绝替换: ${target}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") exists = false;
        else throw error;
      }
      return { packageName, target, exists };
    }));

    const operations = await Promise.all(selected.map(async (component) => {
      const packageName = component.manifest.name;
      const existing = lock.components[packageName];
      const target = existing === undefined
        ? resolve(componentsDirectory, component.namespace, component.componentName)
        : resolve(projectDirectory, existing.path);
      await assertManagedTarget(projectDirectory, target);
      let unchanged = false;
      if (existing?.integrity === npmPackage.integrity && existing.npmComponentUrl === `${reference.packageUrl}#${component.componentName}`) {
        try {
          const local = JSON.parse(await readFile(join(target, "package.json"), "utf8")) as { name?: unknown; version?: unknown };
          unchanged = local.name === packageName && local.version === reference.version;
        } catch {
          // Missing or damaged managed directory is reinstalled below.
        }
      }
      return { component, packageName, existing, target, unchanged };
    }));
    const targets = [...operations.map((operation) => operation.target), ...obsolete.map((operation) => operation.target)];
    if (new Set(targets).size !== targets.length) throw new TypeError("安装清单包含冲突的组件路径");
    if (operations.every((operation) => operation.unchanged) && obsolete.length === 0) {
      return Object.freeze({
        npmPackageUrl: reference.packageUrl,
        components: Object.freeze(operations.map((operation) => Object.freeze({
          packageName: operation.packageName,
          version: reference.version,
          path: operation.target,
          unchanged: true,
        }))),
      });
    }

    const changed = operations.filter((operation) => !operation.unchanged);
    const staged: Array<{
      target: string;
      staging: string;
      backup: string;
      hadTarget: boolean;
      backedUp: boolean;
      installed: boolean;
    }> = [];
    const removed: Array<{ target: string; backup: string; moved: boolean }> = [];
    try {
      for (const operation of changed) {
        const staging = join(dirname(operation.target), `.fourier-add-${randomUUID()}`);
        const backup = join(dirname(operation.target), `.fourier-backup-${randomUUID()}`);
        await copyComponent(operation.component, staging);
        let hadTarget = false;
        try {
          await stat(operation.target);
          hadTarget = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (hadTarget && !options.force && operation.existing === undefined) {
          throw new TypeError(`目标目录已存在: ${operation.target}；如需替换请显式使用 --force`);
        }
        staged.push({ target: operation.target, staging, backup, hadTarget, backedUp: false, installed: false });
      }
      for (const operation of staged) {
        if (operation.hadTarget) {
          await rename(operation.target, operation.backup);
          operation.backedUp = true;
        }
        await rename(operation.staging, operation.target);
        operation.installed = true;
      }
      for (const operation of obsolete) {
        if (!operation.exists) continue;
        const removedOperation = {
          target: operation.target,
          backup: join(dirname(operation.target), `.fourier-backup-${randomUUID()}`),
          moved: false,
        };
        removed.push(removedOperation);
        await rename(removedOperation.target, removedOperation.backup);
        removedOperation.moved = true;
      }
      const components = { ...lock.components };
      for (const operation of obsolete) delete components[operation.packageName];
      for (const operation of operations) {
        components[operation.packageName] = Object.freeze({
          version: reference.version,
          path: portablePath(relative(projectDirectory, operation.target)),
          worldUrl: client.worldUrl,
          npmPackageUrl: reference.packageUrl,
          npmComponentUrl: `${reference.packageUrl}#${operation.component.componentName}`,
          integrity: npmPackage.integrity,
          installedAt: new Date().toISOString(),
        });
      }
      await writeLock(projectDirectory, components);
      await Promise.all([
        ...staged.map((operation) => rm(operation.backup, { recursive: true, force: true }).catch(() => undefined)),
        ...removed.map((operation) => rm(operation.backup, { recursive: true, force: true }).catch(() => undefined)),
      ]);
    } catch (error) {
      for (const operation of [...removed].reverse()) {
        if (operation.moved) await rename(operation.backup, operation.target).catch(() => undefined);
      }
      for (const operation of [...staged].reverse()) {
        await rm(operation.staging, { recursive: true, force: true }).catch(() => undefined);
        if (operation.installed) await rm(operation.target, { recursive: true, force: true }).catch(() => undefined);
        if (operation.backedUp) {
          await rename(operation.backup, operation.target).catch(() => undefined);
        }
      }
      throw error;
    }
    return Object.freeze({
      npmPackageUrl: reference.packageUrl,
      components: Object.freeze(operations.map((operation) => Object.freeze({
        packageName: operation.packageName,
        version: reference.version,
        path: operation.target,
        unchanged: operation.unchanged,
      }))),
    });
  } finally {
    await npmPackage.cleanup();
  }
}

export async function deleteWorldComponent(options: {
  readonly npmUrl: string;
  readonly projectDirectory?: string;
  readonly purge?: boolean;
}): Promise<DeleteWorldPackageResult> {
  const reference = parseNpmPackageReference(options.npmUrl);
  const projectDirectory = await existingDirectory(resolve(options.projectDirectory ?? process.cwd()), "项目目录");
  const lock = await readLock(projectDirectory);
  const selected = Object.entries(lock.components).filter(([, component]) =>
    component.npmPackageUrl === reference.packageUrl &&
    (reference.componentName === undefined || component.npmComponentUrl.endsWith(`#${reference.componentName}`)));
  if (selected.length === 0) throw new TypeError(`${options.npmUrl} 不在 ${WORLD_PROJECT_LOCK} 中`);

  const components = { ...lock.components };
  const removed: DeletedWorldComponent[] = [];
  const operations: Array<{
    packageName: string;
    target: string;
    exists: boolean;
    stagedPath?: string;
    trashPath?: string;
  }> = [];
  for (const [packageName, installed] of selected) {
    const target = resolve(projectDirectory, installed.path);
    await assertManagedTarget(projectDirectory, target);
    let exists = true;
    try {
      await stat(target);
      const local = JSON.parse(await readFile(join(target, "package.json"), "utf8")) as { name?: unknown };
      if (local.name !== packageName) throw new TypeError(`已安装目录的 package name 不匹配，拒绝删除: ${target}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") exists = false;
      else throw error;
    }
    delete components[packageName];
    operations.push({ packageName, target, exists });
  }

  const trash = join(projectDirectory, ".fourier-trash");
  try {
    if (operations.some((operation) => operation.exists)) await mkdir(trash, { recursive: true });
    for (const operation of operations) {
      if (!operation.exists) continue;
      operation.stagedPath = join(trash, `${operation.packageName.replace(/^@/, "").replace("/", "-")}-${randomUUID()}`);
      await rename(operation.target, operation.stagedPath);
      if (!options.purge) operation.trashPath = operation.stagedPath;
    }
    await writeLock(projectDirectory, components);
  } catch (error) {
    for (const operation of [...operations].reverse()) {
      if (operation.stagedPath !== undefined) await rename(operation.stagedPath, operation.target).catch(() => undefined);
    }
    throw error;
  }
  if (options.purge) {
    await Promise.all(operations.map((operation) => operation.stagedPath === undefined
      ? Promise.resolve()
      : rm(operation.stagedPath, { recursive: true, force: true })));
  }
  for (const operation of operations) {
    removed.push(Object.freeze({
      packageName: operation.packageName,
      path: operation.target,
      ...(operation.trashPath === undefined ? {} : { trashPath: operation.trashPath }),
      missing: !operation.exists,
    }));
  }
  return Object.freeze({ npmPackageUrl: reference.packageUrl, components: Object.freeze(removed) });
}
