import { createArtifactHost } from "@fourier-video/core";

export const sdkArtifactHost = createArtifactHost({
  resolveAuthorImport: (specifier) => Bun.resolveSync(specifier, import.meta.dir),
});
