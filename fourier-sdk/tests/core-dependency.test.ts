import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  SDK_ABI_VERSION as CORE_SDK_ABI_VERSION,
  SDK_ARTIFACT as CORE_SDK_ARTIFACT,
  SDK_ARTIFACT_SYMBOL_KEY as CORE_SDK_ARTIFACT_SYMBOL_KEY,
} from "@fourier-video/core/protocol";
import {
  SDK_ABI_VERSION,
  SDK_ARTIFACT,
  SDK_ARTIFACT_SYMBOL_KEY,
} from "../src/index.ts";

describe("SDK Core dependency", () => {
  test("旧 SDK 协议常量 re-export Core identity", () => {
    expect(SDK_ABI_VERSION).toBe(CORE_SDK_ABI_VERSION);
    expect(SDK_ARTIFACT).toBe(CORE_SDK_ARTIFACT);
    expect(SDK_ARTIFACT_SYMBOL_KEY).toBe(CORE_SDK_ARTIFACT_SYMBOL_KEY);
  });

  test("manifest/source 不再依赖或静态导入 render-engine", async () => {
    const packageDirectory = join(import.meta.dir, "..");
    const manifest = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
    expect(manifest.dependencies?.["@fourier-video/core"]).toBe("^1.0.0");
    expect(manifest.dependencies?.["@fourier-video/render-engine"]).toBeUndefined();

    const sourceDirectory = join(packageDirectory, "src");
    const sourceFiles = (await readdir(sourceDirectory, { recursive: true }))
      .filter((path) => extname(path) === ".ts" || extname(path) === ".tsx");
    for (const relativePath of sourceFiles) {
      const source = (await readFile(join(sourceDirectory, relativePath), "utf8"))
        .replace(/^#![^\n]*\n/, "");
      const loader = extname(relativePath) === ".tsx" ? "tsx" : "ts";
      const imports = new Bun.Transpiler({ loader }).scanImports(source);
      expect(imports.map((entry) => entry.path)).not.toContain("@fourier-video/render-engine");
    }
  });
});
