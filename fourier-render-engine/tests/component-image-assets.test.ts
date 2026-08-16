import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bundleReactModule,
  collectComponentDependencies,
  type ComponentDescriptor,
} from "../src/visual-renderer.ts";
import { compileVisualArtifact } from "../src/artifact-compiler.ts";

const ONE_PIXEL_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xq2pAAAAAElFTkSuQmCC",
    "base64",
  ),
);

describe("React component image assets", () => {
  test("PNG imports remain binary dependencies instead of being parsed as TSX", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-component-image-"));
    const bundleDirectory = join(directory, "bundles");
    try {
      const imagePath = join(directory, "poster.png");
      const componentPath = join(directory, "Poster.tsx");
      await Promise.all([
        Bun.write(imagePath, ONE_PIXEL_PNG),
        Bun.write(componentPath, `import posterUrl from "./poster.png";
import { defineReact, defineSchema, field } from "@fourier-video/sdk";
export { posterUrl };
export default defineReact({
  name: "BinaryPoster",
  schema: defineSchema({
    poster: field.asset({ accept: ["image/png"], default: posterUrl }),
  }),
  static: true,
  component({ props }) { return <img src={props.poster} />; },
  designPreview() {
    return { props: {}, composition: { width: 1, height: 1, durationSeconds: 0 } };
  },
});`),
      ]);
      const node: ComponentDescriptor = {
        id: "poster",
        kind: "react",
        component: "Poster.tsx",
        componentPath,
        exportName: "default",
      };

      const dependencies = await collectComponentDependencies(node, [directory]);
      expect(dependencies).toContain(componentPath);
      expect(dependencies).toContain(imagePath);

      const imported = await bundleReactModule(node, bundleDirectory, [directory]);
      expect(imported.default).toBeDefined();
      expect(imported.posterUrl).toStartWith(
        "https://fourier.invalid/__fourier_image_assets__/",
      );

      const artifact = await compileVisualArtifact({ entryPath: componentPath });
      expect(artifact.props.poster).toBe(imported.posterUrl);
      expect(artifact.bundleSnapshot.javascript).toContain(imported.posterUrl as string);
      expect(artifact.bundleSnapshot.imageAssets).toEqual([
        expect.objectContaining({
          url: imported.posterUrl,
          mimeType: "image/png",
        }),
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
