import { sdkArtifactHost } from "./artifact-host.ts";
import { createWorldPackageArchive, type WorldPackageArchive } from "./world-archive.ts";
import { FourierWorldClient, type WorldPublishResult } from "./world-client.ts";
import { loadWorldPackage, type LoadedWorldPackage } from "./world-manifest.ts";
import { renderWorldPreviewVideo, type WorldPreviewVideo } from "./world-preview.ts";

const { compileVisualArtifact } = sdkArtifactHost;

export interface PreparedWorldPackage {
  readonly componentPackage: LoadedWorldPackage;
  readonly archive: WorldPackageArchive;
  readonly preview: WorldPreviewVideo;
  readonly artifact: {
    readonly name: string;
    readonly kind: "react" | "motion";
    readonly sdkAbiVersion: 1 | 1.1;
    readonly renderer:
      | "dom-timeline"
      | "dom-timeline-ffmpeg-video";
    readonly dependencies: readonly string[];
  };
}

export async function prepareWorldPackage(inputPath = process.cwd()): Promise<PreparedWorldPackage> {
  const componentPackage = await loadWorldPackage(inputPath);
  const compiled = await compileVisualArtifact({ entryPath: componentPackage.entryPath });
  if (compiled.name !== componentPackage.componentName) {
    throw new TypeError(
      `package.json name 中的组件名 ${componentPackage.componentName} 与 artifact definition.name ${compiled.name} 不一致`,
    );
  }
  const manifestType = componentPackage.manifest.fourier.type;
  if (compiled.kind === "motion" && manifestType !== "motion") {
    throw new TypeError(`Motion artifact 的 fourier.type 必须是 motion，当前为 ${manifestType}`);
  }
  if (compiled.kind === "react" && manifestType === "motion") {
    throw new TypeError("React artifact 的 fourier.type 不能是 motion");
  }
  const archive = await createWorldPackageArchive(componentPackage, compiled.dependencies);
  const preview = await renderWorldPreviewVideo(compiled);
  return Object.freeze({
    componentPackage,
    archive,
    preview,
    artifact: Object.freeze({
      name: compiled.name,
      kind: compiled.kind,
      sdkAbiVersion: compiled.sdkAbiVersion,
      renderer: compiled.renderer,
      dependencies: compiled.dependencies,
    }),
  });
}

export async function publishWorldPackage(options: {
  readonly inputPath?: string;
  readonly worldUrl: string;
  readonly token: string;
}): Promise<{ readonly prepared: PreparedWorldPackage; readonly result: WorldPublishResult }> {
  const prepared = await prepareWorldPackage(options.inputPath);
  const client = new FourierWorldClient({ worldUrl: options.worldUrl, token: options.token });
  const result = await client.publish(prepared.componentPackage, prepared.archive, prepared.preview);
  return Object.freeze({ prepared, result });
}
