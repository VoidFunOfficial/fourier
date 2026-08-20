import {
  compileVisualArtifact as compileArtifact,
  type CompiledVisualArtifact,
  type CompileVisualArtifactOptions,
} from "./artifact-compiler.ts";
import {
  renderVisualArtifactVideo as renderArtifactVideo,
  type RenderVisualArtifactVideoOptions,
  type RenderVisualArtifactVideoResult,
} from "./artifact-video-renderer.ts";
import type { ArtifactHostOptions } from "./integration-types.ts";
import {
  VisualTimelineRuntime,
  type VisualTimelineRuntimeOptions,
} from "./visual-timeline-runtime.ts";

export interface ArtifactHost {
  compileVisualArtifact(options: CompileVisualArtifactOptions): Promise<CompiledVisualArtifact>;
  createTimelineRuntime(options?: Omit<VisualTimelineRuntimeOptions, "resolveAuthorImport">): VisualTimelineRuntime;
  renderVisualArtifactVideo(
    input: CompiledVisualArtifact | CompileVisualArtifactOptions,
    options: RenderVisualArtifactVideoOptions,
  ): Promise<RenderVisualArtifactVideoResult>;
}

/** Creates the SDK/render integration seam without introducing a Core → SDK dependency. */
export function createArtifactHost(options: ArtifactHostOptions): ArtifactHost {
  const integration = Object.freeze({ resolveAuthorImport: options.resolveAuthorImport });
  const host: ArtifactHost = {
    compileVisualArtifact: (input) => compileArtifact(input, integration),
    createTimelineRuntime: (runtimeOptions = {}) => new VisualTimelineRuntime({
      ...runtimeOptions,
      resolveAuthorImport: integration.resolveAuthorImport,
    }),
    renderVisualArtifactVideo: (input, renderOptions) =>
      renderArtifactVideo(input, renderOptions, integration),
  };
  return Object.freeze(host);
}
