import { createHash } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  readProjectDefinition,
  type AnyProjectDefinition,
} from "@fourier-video/sdk/project";
import {
  authorRuntimeAliasPlugin,
  isCompilerInjectedReactImport,
  isReactRuntimeImport,
  isSdkAuthorImport,
} from "./author-runtime.ts";
import { fail, RenderEngineError } from "./errors.ts";

export interface LoadedProjectModule {
  readonly definition: AnyProjectDefinition;
  readonly sourcePath: string;
  readonly bundleHash: string;
}

async function resolveLocalDependency(importer: string, specifier: string): Promise<string> {
  const base = resolve(dirname(importer), specifier);
  const extension = extname(base).toLowerCase();
  const sourceBase = extension === "" ? base : base.slice(0, -extension.length);
  const substitutions = extension === ".js"
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
    ...substitutions,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.json`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    join(base, "index.js"),
    join(base, "index.jsx"),
  ];
  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) return candidate;
  }
  fail("PROJECT_IMPORT_NOT_FOUND", `工程本地依赖不存在: ${specifier}`, {
    importer,
    specifier,
  });
}

async function validateLocalStaticDependencies(entryPath: string): Promise<void> {
  const root = dirname(entryPath);
  const visited = new Set<string>();
  const visit = async (path: string): Promise<void> => {
    if (visited.has(path)) return;
    const fromRoot = relative(root, path);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
      fail("PROJECT_IMPORT_OUTSIDE_ROOT", `工程依赖不能逃出 main.tsx 所在目录: ${path}`);
    }
    visited.add(path);
    const extension = extname(path).toLowerCase();
    if (extension === ".json") return;
    const loader = extension === ".ts" || extension === ".mts" || extension === ".cts"
      ? "ts"
      : extension === ".js" || extension === ".mjs" || extension === ".cjs"
        ? "js"
        : extension === ".jsx"
          ? "jsx"
          : "tsx";
    const source = await Bun.file(path).text();
    for (const dependency of new Bun.Transpiler({ loader }).scanImports(source)) {
      if (dependency.kind === "dynamic-import") {
        fail("PROJECT_DYNAMIC_IMPORT", `工程不支持动态 import: ${dependency.path}`, {
          importer: path,
          specifier: dependency.path,
        });
      }
      if (
        isCompilerInjectedReactImport(dependency) ||
        isReactRuntimeImport(dependency.path) ||
        isSdkAuthorImport(dependency.path)
      ) {
        continue;
      }
      if (!dependency.path.startsWith(".")) {
        fail(
          "PROJECT_IMPORT_NOT_ALLOWED",
          `工程只允许本地静态依赖和 SDK/React runtime，收到: ${dependency.path}`,
          { importer: path, specifier: dependency.path },
        );
      }
      await visit(await resolveLocalDependency(path, dependency.path));
    }
  };
  await visit(entryPath);
}

export async function loadProjectModule(entryPath: string): Promise<LoadedProjectModule> {
  const sourcePath = resolve(entryPath);
  if (basename(sourcePath) !== "main.tsx") {
    fail(
      "UNSUPPORTED_PROJECT_ENTRY",
      `Fourier 工程只接受 main.tsx: ${sourcePath}`,
      { sourcePath },
    );
  }
  const information = await stat(sourcePath).catch(() => undefined);
  if (information === undefined || !information.isFile()) {
    fail("PROJECT_NOT_FOUND", `工程入口不存在: ${sourcePath}`);
  }
  await validateLocalStaticDependencies(sourcePath);
  const outputDirectory = await mkdtemp(join(tmpdir(), "fourier-project-module-"));
  try {
    const result = await Bun.build({
      entrypoints: [sourcePath],
      outdir: outputDirectory,
      target: "bun",
      format: "esm",
      splitting: false,
      minify: false,
      sourcemap: "inline",
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      plugins: [authorRuntimeAliasPlugin("fourier-project-author-runtime")],
    });
    const output = result.outputs.find((item) => item.type.startsWith("text/javascript"));
    if (!result.success || output === undefined) {
      fail(
        "PROJECT_COMPILE_FAILED",
        result.logs.map((log) => log.message).join("\n") || `无法编译工程: ${sourcePath}`,
        { sourcePath },
      );
    }
    const bytes = new Uint8Array(await output.arrayBuffer());
    const module = await import(
      `${pathToFileURL(output.path).href}?source=${information.mtimeMs}`
    ) as Record<string, unknown>;
    const definition = readProjectDefinition(module.default);
    if (definition === undefined) {
      fail(
        "INVALID_PROJECT_DEFINITION",
        "main.tsx default export 必须由 defineProject() 或 defineTemplate() 创建",
        { sourcePath },
      );
    }
    return {
      definition,
      sourcePath,
      bundleHash: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    if (error instanceof RenderEngineError) throw error;
    fail(
      "PROJECT_COMPILE_FAILED",
      `无法加载工程 TSX: ${error instanceof Error ? error.message : String(error)}`,
      { sourcePath },
    );
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
}
