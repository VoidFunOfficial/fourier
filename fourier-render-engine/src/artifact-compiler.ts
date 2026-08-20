import { renderArtifactHost } from "./core-host.ts";

export const compileVisualArtifact = renderArtifactHost.compileVisualArtifact;

export type {
  BrowserBundleSnapshot,
  CompiledArtifactComposition,
  CompiledArtifactFont,
  CompiledVisualArtifact,
  CompileVisualArtifactOptions,
  DynamicSubjectProvider,
  DynamicSubjectSample,
} from "@fourier-video/core/artifact";
