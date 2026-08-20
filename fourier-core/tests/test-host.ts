import { join } from "node:path";
import { createArtifactHost } from "../src/index.ts";

export const artifactHost = createArtifactHost({
  resolveAuthorImport: (specifier) => Bun.resolveSync(specifier, import.meta.dir),
});

export function componentFixture(filename: string): string {
  return join(
    import.meta.dir,
    "../../fourier-render-engine/tests/components",
    filename,
  );
}
