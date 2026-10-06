import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { Plugin } from "esbuild";
import { fail } from "./errors.ts";

export const CUBISM_CORE_FILENAME = "live2dcubismcore-5.3.min.js";
// The runtime is installed separately after accepting Live2D's license.
export const CUBISM_CORE_SHA256 = "8741f739779b5d5210872bd3d7d99f0f1e56e6c87409e7d26d6bb4b80aa1ef47";

export interface CubismAssetFiles {
  readonly settings: string;
  readonly moc: string;
  readonly textures: readonly string[];
}

/** Resolve one Cubism export, keeping every reference inside its model directory. */
export async function cubismAssetFiles(entry: string): Promise<CubismAssetFiles> {
  const settings = entry.endsWith(".moc3") ? entry.replace(/\.moc3$/, ".model3.json") : entry;
  let data: unknown;
  try { data = JSON.parse(await readFile(settings, "utf8")); }
  catch { fail("INVALID_CUBISM_ASSET", `需要同目录同名的 model3.json：${settings}`); }
  if (!data || typeof data !== "object" || !("Version" in data) || data.Version !== 3 || !("FileReferences" in data)) {
    fail("INVALID_CUBISM_ASSET", "Cubism model3.json 必须为 Version 3");
  }
  const refs = data.FileReferences;
  if (!refs || typeof refs !== "object" || !("Moc" in refs) || !("Textures" in refs) || !Array.isArray(refs.Textures) || !refs.Textures.length) {
    fail("INVALID_CUBISM_ASSET", "Cubism 导出缺少 Moc 或 Textures");
  }
  const root = await realpath(dirname(settings));
  const local = async (value: unknown): Promise<string> => {
    if (typeof value !== "string" || !value || isAbsolute(value) || /^[a-z]+:/i.test(value) || value.includes("\\")) {
      fail("INVALID_CUBISM_ASSET", "Cubism 资源必须是模型目录内的相对路径");
    }
    const file = await realpath(resolve(root, value)); const path = relative(root, file);
    if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) fail("INVALID_CUBISM_ASSET", "Cubism 资源不能越过模型目录");
    return file;
  };
  const moc = await local(refs.Moc);
  if (entry.endsWith(".moc3") && await realpath(entry) !== moc) fail("INVALID_CUBISM_ASSET", "model3.json 的 Moc 与导入文件不匹配");
  return Object.freeze({ settings: await realpath(settings), moc, textures: Object.freeze(await Promise.all(refs.Textures.map(local))) });
}

/** Host-only runtime lookup; never reads executable code from the model export. */
async function coreSource(): Promise<string> {
  const override = process.env.FOURIER_CUBISM_CORE_PATH;
  const candidates: string[] = override ? [resolve(override)] : [];
  if (!override) {
    let directory = process.cwd();
    for (;;) {
      candidates.push(resolve(directory, ".fourier/cubism", CUBISM_CORE_FILENAME));
      const parent = dirname(directory); if (parent === directory) break; directory = parent;
    }
  }
  for (const file of candidates) {
    let source: Buffer;
    try { source = await readFile(file); } catch { continue; }
    if (createHash("sha256").update(source).digest("hex") !== CUBISM_CORE_SHA256) {
      fail("INVALID_CUBISM_CORE", "Cubism Core 校验不匹配，请重新安装项目固定的官方 5.3 运行库");
    }
    return source.toString("utf8");
  }
  fail("CUBISM_CORE_REQUIRED", "缺少 Cubism Core 5.3。请先阅读官方许可并运行 bun run avatar:setup-core --accept-license");
}

/** Trusted, pinned runtime factory shared by browser compilation and offline inspection. */
export async function cubismCoreModuleSource(): Promise<string> {
  const source = await coreSource();
  const anchor = ",_em_module())}(Live2DCubismCore=";
  if (source.split(anchor).length !== 2) fail("INVALID_CUBISM_CORE", "Cubism Core 初始化入口不匹配");
  // Bridge Emscripten readiness before constructing a Moc; no timers/polling.
  const initialized = source.replace(anchor,
    ",_em_module({onRuntimeInitialized:fourierCoreReady,onAbort:fourierCoreAbort}))}(Live2DCubismCore=");
  return `let instance; export function createCore(){ return instance ??= new Promise((resolve,reject)=>{ const module=undefined, exports=undefined, require=undefined; const fourierCoreReady=()=>resolve(Live2DCubismCore),fourierCoreAbort=(error)=>reject(new Error(String(error)));\n${initialized}\n}); }`;
}

/** Importing a .moc3 automatically binds the sibling manifest and texture imports. */
export function cubismAssetPlugin(): Plugin {
  return {
    name: "fourier-cubism-assets",
    setup(build) {
      build.onLoad({ filter: /(?:\.moc3|\.model3\.json)$/ }, async ({ path }) => {
        const files = await cubismAssetFiles(path);
        const moc = await readFile(files.moc);
        if (moc.subarray(0, 4).toString() !== "MOC3") fail("INVALID_CUBISM_ASSET", "无效的 MOC3 文件头");
        return {
          loader: "js",
          resolveDir: dirname(path),
          contents: `import { createCore } from "fourier:cubism-core";\n` +
            files.textures.map((file, i) => `import texture${i} from ${JSON.stringify(file)};`).join("\n") +
            `\nexport default Object.freeze({kind:"cubism",name:${JSON.stringify(basename(files.moc, ".moc3"))},mocBase64:${JSON.stringify(moc.toString("base64"))},textures:Object.freeze([${files.textures.map((_, i) => `texture${i}`).join(",")}]),createCore});`,
        };
      });
      build.onResolve({ filter: /^fourier:cubism-core$/ }, () => ({ path: "core", namespace: "fourier-cubism" }));
      build.onLoad({ filter: /^core$/, namespace: "fourier-cubism" }, async () => {
        return {
          loader: "js",
          // Lazy initialization keeps the metadata inspector free of Core side effects.
          contents: await cubismCoreModuleSource(),
        };
      });
    },
  };
}
