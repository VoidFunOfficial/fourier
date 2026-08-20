import { createArtifactHost } from "@fourier-video/core";

export const resolveAuthorImport = (specifier: string): string =>
  Bun.resolveSync(specifier, import.meta.dir);

export const renderArtifactHost = createArtifactHost({ resolveAuthorImport });
