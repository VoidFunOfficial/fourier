import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  authorRuntimeAliasPlugin,
  isReactRuntimeImport,
  isSdkAuthorImport,
} from "./author-runtime.ts";
import { CoreError, fail } from "./errors.ts";
import {
  buildSecureBrowserBundle,
  formatBrowserBuildFailure,
  scanModuleImports,
} from "./secure-browser-bundler.ts";
import { SecureExecutionHost } from "./secure-execution-host.ts";
import type { ArtifactHostOptions } from "./integration-types.ts";

export const PROJECT_EXECUTION_REVISION = "project-wire-v1" as const;

export interface AuthorElementWireV1 {
  readonly revision: 1;
  readonly tag: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: readonly AuthorElementWireV1[];
}

export interface ProjectDefinitionSnapshotV1 {
  readonly revision: 1;
  readonly kind: "project" | "template";
  readonly root: AuthorElementWireV1;
  readonly parameters: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly bindingSources: Readonly<Record<string, "explicit" | "default">>;
}

export interface MaterializeProjectModuleOptions {
  readonly entryPath: string;
  readonly moduleRoot: string;
  readonly projectRoot: string;
  readonly bindings?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}

export interface MaterializedProjectModule {
  readonly sourcePath: string;
  readonly sourceFingerprint: string;
  readonly executionRevision: typeof PROJECT_EXECUTION_REVISION;
  readonly definition: ProjectDefinitionSnapshotV1;
}

interface Snapshot {
  sourcePath: string;
  snapshotEntry: string;
  hashes: readonly { path: string; sha256: string; aliasTarget?: string }[];
  cleanup(): Promise<void>;
}

function within(root: string, path: string): boolean {
  const value = relative(root, path);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function resolveDependency(importer: string, specifier: string): Promise<string> {
  const base = resolve(dirname(importer), specifier);
  const extension = extname(base).toLowerCase();
  const stem = extension === "" ? base : base.slice(0, -extension.length);
  const substitutions = extension === ".js" ? [`${stem}.ts`, `${stem}.tsx`]
    : extension === ".jsx" ? [`${stem}.tsx`]
    : extension === ".mjs" ? [`${stem}.mts`]
    : extension === ".cjs" ? [`${stem}.cts`] : [];
  for (const candidate of [
    base, ...substitutions, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`,
    `${base}.mts`, `${base}.cts`, `${base}.mjs`, `${base}.cjs`, `${base}.json`,
    join(base, "index.ts"), join(base, "index.tsx"), join(base, "index.js"),
  ]) {
    const canonical = await realpath(candidate).catch(() => undefined);
    if (canonical !== undefined && (await stat(candidate)).isFile()) return resolve(candidate);
  }
  fail("PROJECT_IMPORT_NOT_FOUND", `工程本地依赖不存在: ${specifier}`, { importer, specifier });
}

async function immutableSnapshot(options: MaterializeProjectModuleOptions): Promise<Snapshot> {
  const requestedSourcePath = resolve(options.entryPath);
  const logicalModuleRoot = resolve(options.moduleRoot);
  const logicalProjectRoot = resolve(options.projectRoot);
  const [sourcePath, moduleRoot, projectRoot] = await Promise.all([
    realpath(requestedSourcePath).catch(() => undefined),
    realpath(logicalModuleRoot).catch(() => undefined),
    realpath(logicalProjectRoot).catch(() => undefined),
  ]);
  if (sourcePath === undefined || !(await lstat(sourcePath)).isFile()) fail("PROJECT_NOT_FOUND", `工程入口不存在: ${options.entryPath}`);
  if (basename(requestedSourcePath) !== "main.tsx") fail("UNSUPPORTED_PROJECT_ENTRY", `Fourier 工程只接受 main.tsx: ${requestedSourcePath}`);
  if (moduleRoot === undefined || projectRoot === undefined || !within(moduleRoot, sourcePath) || !within(projectRoot, sourcePath)) {
    fail("PROJECT_IMPORT_OUTSIDE_ROOT", `工程入口必须同时位于 moduleRoot 与 projectRoot: ${sourcePath}`);
  }
  const entries = new Map<string, { bytes: Uint8Array; relativePath: string; sha256: string }>();
  const aliases = new Map<string, string>();
  let totalBytes = 0;
  const visit = async (path: string): Promise<void> => {
    const logical = resolve(path);
    const canonical = await realpath(logical);
    if (!within(moduleRoot, canonical) || !within(projectRoot, canonical)) {
      fail("PROJECT_IMPORT_OUTSIDE_ROOT", `工程依赖逃出允许根: ${canonical}`, { moduleRoot, projectRoot });
    }
    if (
      (!within(logicalModuleRoot, logical) && !within(moduleRoot, logical)) ||
      (!within(logicalProjectRoot, logical) && !within(projectRoot, logical))
    ) {
      fail("PROJECT_IMPORT_OUTSIDE_ROOT", `工程依赖路径逃出允许根: ${logical}`, { moduleRoot, projectRoot });
    }
    const logicalRelative = within(logicalModuleRoot, logical)
      ? relative(logicalModuleRoot, logical)
      : relative(moduleRoot, logical);
    const canonicalRelative = relative(moduleRoot, canonical);
    if (logicalRelative !== canonicalRelative) aliases.set(logicalRelative, canonicalRelative);
    if (entries.has(canonical)) return;
    const information = await lstat(canonical);
    if (!information.isFile()) fail("PROJECT_IMPORT_OUTSIDE_ROOT", `工程依赖不是普通文件: ${canonical}`);
    if (information.size > 2 * 1024 * 1024 || entries.size >= 500) fail("SECURE_EXECUTION_LIMIT", "Project 源文件数量或大小超限");
    const bytes = new Uint8Array(await readFile(canonical));
    totalBytes += bytes.byteLength;
    if (totalBytes > 16 * 1024 * 1024) fail("SECURE_EXECUTION_LIMIT", "Project 源码总计超过 16 MiB");
    entries.set(canonical, { bytes, relativePath: relative(moduleRoot, canonical), sha256: sha256(bytes) });
    const extension = extname(canonical).toLowerCase();
    if (extension === ".json") return;
    const loader = extension === ".ts" || extension === ".mts" || extension === ".cts" ? "ts"
      : extension === ".js" || extension === ".mjs" || extension === ".cjs" ? "js"
      : extension === ".jsx" ? "jsx" : "tsx";
    const source = new TextDecoder().decode(bytes);
    if (/\brequire\s*\(/.test(source)) fail("PROJECT_IMPORT_NOT_ALLOWED", "工程不支持 CommonJS require");
    for (const dependency of await scanModuleImports(source, loader)) {
      if (dependency.kind === "dynamic-import") fail("PROJECT_DYNAMIC_IMPORT", `工程不支持动态 import: ${dependency.path}`);
      if (dependency.path === undefined) fail("PROJECT_DYNAMIC_IMPORT", "工程 import 必须使用静态字符串");
      else if (dependency.path.startsWith(".")) await visit(await resolveDependency(canonical, dependency.path));
      else if (!isReactRuntimeImport(dependency.path) && !isSdkAuthorImport(dependency.path)) {
        fail("PROJECT_IMPORT_NOT_ALLOWED", `工程只允许本地依赖及 SDK runtime: ${dependency.path}`);
      }
    }
  };
  await visit(requestedSourcePath);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "fourier-project-snapshot-"));
  const snapshotRoot = join(temporaryRoot, "source");
  await mkdir(snapshotRoot, { recursive: true, mode: 0o700 });
  try {
    for (const entry of entries.values()) {
      const target = join(snapshotRoot, entry.relativePath);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, entry.bytes, { flag: "wx", mode: 0o400 });
      await chmod(target, 0o400);
    }
    for (const [aliasRelative, targetRelative] of aliases) {
      const aliasPath = join(snapshotRoot, aliasRelative);
      const targetPath = join(snapshotRoot, targetRelative);
      await mkdir(dirname(aliasPath), { recursive: true, mode: 0o700 });
      await symlink(relative(dirname(aliasPath), targetPath), aliasPath);
    }
    const snapshotEntryRelative = within(logicalModuleRoot, requestedSourcePath)
      ? relative(logicalModuleRoot, requestedSourcePath)
      : relative(moduleRoot, sourcePath);
    return {
      sourcePath,
      snapshotEntry: join(snapshotRoot, snapshotEntryRelative),
      hashes: Object.freeze([
        ...[...entries].map(([path, entry]) => ({ path, sha256: entry.sha256 })),
        ...[...aliases].map(([path, aliasTarget]) => ({ path, sha256: sha256(`symlink:${aliasTarget}`), aliasTarget })),
      ].sort((a, b) => a.path.localeCompare(b.path))),
      cleanup: () => rm(temporaryRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

function workerSource(entryPath: string): string {
  return `
import definition from ${JSON.stringify(entryPath)};
import { serializeProjectDefinition } from "@fourier-video/sdk/project";
globalThis.onmessage = (event) => {
  try {
    const input = JSON.parse(event.data);
    const value = serializeProjectDefinition(definition, input.bindings ?? {});
    globalThis.postMessage(JSON.stringify({ revision: 1, profile: "project-materialize", ok: true, value }));
  } catch (error) {
    globalThis.postMessage(JSON.stringify({ revision: 1, profile: "project-materialize", ok: false, error: {
      code: typeof error?.code === "string" ? error.code : "ARTIFACT_EXECUTION_FAILED",
      message: error instanceof Error ? error.message : String(error),
    } }));
  }
};`;
}

function validateDefinition(value: unknown): ProjectDefinitionSnapshotV1 {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized) > 16 * 1024 * 1024) fail("SECURE_EXECUTION_LIMIT", "Project wire 超过 16 MiB");
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("SECURE_EXECUTION_PROTOCOL_INVALID", "Project wire 必须是对象");
  const candidate = value as Record<string, unknown>;
  const topLevelKeys = Object.keys(candidate).filter((key) => ![
    "revision", "kind", "root", "parameters", "bindings", "bindingSources",
  ].includes(key));
  if (topLevelKeys.length > 0) fail("SECURE_EXECUTION_PROTOCOL_INVALID", "Project wire 包含未知字段", { fields: topLevelKeys });
  if (candidate.revision !== 1 || (candidate.kind !== "project" && candidate.kind !== "template")) fail("SECURE_EXECUTION_PROTOCOL_INVALID", "Project wire header 无效");
  let nodes = 0;
  const visit = (node: unknown, depth: number): void => {
    if (depth > 64) fail("SECURE_EXECUTION_LIMIT", "Project wire 深度超过 64");
    if (typeof node !== "object" || node === null || Array.isArray(node)) fail("SECURE_EXECUTION_PROTOCOL_INVALID", "Project node 无效");
    const record = node as Record<string, unknown>;
    const nodeKeys = Object.keys(record).filter((key) => !["revision", "tag", "props", "children"].includes(key));
    if (nodeKeys.length > 0) fail("SECURE_EXECUTION_PROTOCOL_INVALID", "Project node 包含未知字段", { fields: nodeKeys });
    if (record.revision !== 1 || typeof record.tag !== "string" || typeof record.props !== "object" || !Array.isArray(record.children)) {
      fail("SECURE_EXECUTION_PROTOCOL_INVALID", "Project node header 无效");
    }
    nodes += 1;
    if (nodes > 10_000) fail("SECURE_EXECUTION_LIMIT", "Project wire 节点超过 10,000");
    for (const child of record.children) visit(child, depth + 1);
  };
  visit(candidate.root, 0);
  if (typeof candidate.parameters !== "object" || candidate.parameters === null || typeof candidate.bindings !== "object" || candidate.bindings === null || typeof candidate.bindingSources !== "object" || candidate.bindingSources === null) {
    fail("SECURE_EXECUTION_PROTOCOL_INVALID", "Project parameter wire 无效");
  }
  return value as ProjectDefinitionSnapshotV1;
}

export async function materializeProjectModule(
  options: MaterializeProjectModuleOptions,
  integration: ArtifactHostOptions,
): Promise<MaterializedProjectModule> {
  const snapshot = await immutableSnapshot(options);
  try {
    const result = await buildSecureBrowserBundle({
      entryPoint: "fourier:project-materializer",
      minifyWhitespace: false,
      plugins: [{
        name: "fourier-project-materializer-bootstrap",
        setup(build) {
          build.onResolve({ filter: /^fourier:project-materializer$/ }, () => ({ path: "bootstrap", namespace: "fourier" }));
          build.onLoad({ filter: /^bootstrap$/, namespace: "fourier" }, () => ({ contents: workerSource(snapshot.snapshotEntry), loader: "tsx" }));
        },
      }, authorRuntimeAliasPlugin("fourier-project-materializer-runtime", integration.resolveAuthorImport)],
    });
    const output = result.outputFiles?.find((candidate) => candidate.path.endsWith(".js"));
    if (output === undefined) fail("PROJECT_COMPILE_FAILED", "Project browser bundle 缺失");
    const javascript = output.text;
    const definition = validateDefinition(await new SecureExecutionHost().execute({
      profile: "project-materialize",
      workerJavascript: javascript,
      input: Object.freeze({ bindings: options.bindings ?? {} }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    }));
    return Object.freeze({
      sourcePath: snapshot.sourcePath,
      executionRevision: PROJECT_EXECUTION_REVISION,
      sourceFingerprint: sha256(JSON.stringify({ revision: PROJECT_EXECUTION_REVISION, files: snapshot.hashes, bundle: sha256(javascript) })),
      definition,
    });
  } catch (error) {
    if (error instanceof CoreError) throw error;
    throw new CoreError("ARTIFACT_EXECUTION_FAILED", formatBrowserBuildFailure(error));
  } finally {
    await snapshot.cleanup();
  }
}
