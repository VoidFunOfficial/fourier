import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { sdkArtifactHost } from "./artifact-host.ts";
import { FourierWorldClient, type WorldPublishResult } from "./world-client.ts";
import { resolveNpmPackage, type ResolvedNpmPackage } from "./npm-package.ts";
import type { LoadedWorldPackage } from "./world-manifest.ts";
import { renderWorldPreviewVideo, type WorldPreviewVideo } from "./world-preview.ts";

const { compileVisualArtifact } = sdkArtifactHost;

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path.length === 0 || (!path.startsWith("..") && !isAbsolute(path));
}

async function assertDeclaredDependencies(
  componentPackage: LoadedWorldPackage,
  dependencies: readonly string[],
): Promise<void> {
  const root = await realpath(componentPackage.rootDirectory);
  const declared = await Promise.all(componentPackage.manifest.files.map(async (path) => {
    try {
      const candidate = await realpath(resolve(root, path));
      if (!isInside(root, candidate)) throw new TypeError(`files 路径逃逸 package 目录: ${path}`);
      return { path: candidate, directory: (await stat(candidate)).isDirectory() };
    } catch (error) {
      if (error instanceof TypeError) throw error;
      throw new TypeError(`files 声明的路径不存在: ${path}`);
    }
  }));
  for (const dependency of dependencies) {
    const candidate = await realpath(dependency);
    if (!isInside(root, candidate)) throw new TypeError(`artifact 依赖位于组件 package 之外: ${dependency}`);
    if (!declared.some((item) => candidate === item.path || (item.directory && isInside(item.path, candidate)))) {
      throw new TypeError(`artifact 依赖未包含在 package.json files 中: ${relative(root, candidate)}`);
    }
  }
}

export interface PreparedWorldComponent {
  readonly componentPackage: LoadedWorldPackage;
  readonly preview: WorldPreviewVideo;
  readonly artifact: {
    readonly name: string;
    readonly kind: "react" | "motion" | "shader";
    readonly sdkAbiVersion: 1 | 1.1 | 1.2;
    readonly renderer: "dom-timeline" | "dom-timeline-ffmpeg-video";
    readonly dependencies: readonly string[];
  };
}

export interface PreparedWorldPackage {
  readonly npmPackage: ResolvedNpmPackage;
  readonly components: readonly PreparedWorldComponent[];
  cleanup(): Promise<void>;
}

export async function prepareWorldPackage(
  npmUrl: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<PreparedWorldPackage> {
  const npmPackage = await resolveNpmPackage(npmUrl, fetcher);
  if (npmPackage.reference.componentName !== undefined) {
    await npmPackage.cleanup();
    throw new TypeError("publish 只接受不带 #ComponentName 的 npm package URL");
  }
  try {
    const components: PreparedWorldComponent[] = [];
    for (const componentPackage of npmPackage.components) {
      const compiled = await compileVisualArtifact({ entryPath: componentPackage.entryPath });
      if (compiled.kind !== "react" && compiled.kind !== "motion" && compiled.kind !== "shader") {
        throw new TypeError(`Fourier World 组件 ${compiled.name} 只支持 React、Motion 或 Shader artifact`);
      }
      if (compiled.name !== componentPackage.componentName) {
        throw new TypeError(`${componentPackage.manifest.name} 与 artifact definition.name ${compiled.name} 不一致`);
      }
      const manifestType = componentPackage.manifest.fourier.type;
      if (compiled.kind === "motion" && manifestType !== "motion") {
        throw new TypeError(`Motion artifact ${compiled.name} 的 fourier.type 必须是 motion`);
      }
      if (compiled.kind === "shader" && manifestType !== "shader") {
        throw new TypeError(`Shader artifact ${compiled.name} 的 fourier.type 必须是 shader`);
      }
      if (compiled.kind === "react" && (manifestType === "motion" || manifestType === "shader")) {
        throw new TypeError(`React artifact ${compiled.name} 的 fourier.type 不能是 ${manifestType}`);
      }
      await assertDeclaredDependencies(componentPackage, compiled.dependencies);
      components.push(Object.freeze({
        componentPackage,
        preview: await renderWorldPreviewVideo(compiled),
        artifact: Object.freeze({
          name: compiled.name,
          kind: compiled.kind,
          sdkAbiVersion: compiled.sdkAbiVersion,
          renderer: compiled.renderer,
          dependencies: compiled.dependencies,
        }),
      }));
    }
    return Object.freeze({
      npmPackage,
      components: Object.freeze(components),
      cleanup: () => npmPackage.cleanup(),
    });
  } catch (error) {
    await npmPackage.cleanup();
    throw error;
  }
}

export async function publishWorldPackage(options: {
  readonly npmUrl: string;
  readonly worldUrl: string;
  readonly token: string;
  readonly fetch?: typeof globalThis.fetch;
}): Promise<{ readonly prepared: PreparedWorldPackage; readonly result: WorldPublishResult }> {
  const prepared = await prepareWorldPackage(options.npmUrl, options.fetch ?? globalThis.fetch);
  try {
    const client = new FourierWorldClient({
      worldUrl: options.worldUrl,
      token: options.token,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
    const result = await client.publish(prepared);
    return Object.freeze({ prepared, result });
  } catch (error) {
    await prepared.cleanup();
    throw error;
  }
}
