import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

import { prepareWorldPackage } from "../src/world-publish.ts";

const run = Bun.env.RUN_DOM_TESTS === "1" && Bun.env.RUN_FFMPEG_TESTS === "1";
const describeIntegration = run ? describe : describe.skip;
const npmUrl = "https://www.npmjs.com/package/@studio/components/v/1.0.0";

describeIntegration("Fourier World npm publish preparation", () => {
  test("逐个编译 React/Shader npm 包成员并生成 MP4", async () => {
    const [reactSource, shaderSource] = await Promise.all([
      Bun.file(new URL("fixtures/DomTestingPanel.tsx", import.meta.url)).text(),
      Bun.file(new URL("../example/ChannelShader.tsx", import.meta.url)).text(),
    ]);
    const files = {
      "package/package.json": JSON.stringify({
        name: "@studio/components", version: "1.0.0", description: "collection", license: "MIT",
        fourier: { schemaVersion: 1, components: [
          "components/DomTestingPanel/package.json",
          "components/ChannelShader/package.json",
        ] },
      }),
      "package/components/DomTestingPanel/package.json": JSON.stringify({
        name: "@studio/DomTestingPanel", version: "1.0.0", description: "fixture", license: "MIT",
        files: ["main.tsx"],
        fourier: {
          entry: "main.tsx", type: "card", summary: "fixture", instruction: "Use in tests",
          useCases: ["tests"], tags: ["test"], style: ["minimal"],
        },
      }),
      "package/components/DomTestingPanel/main.tsx": reactSource,
      "package/components/ChannelShader/package.json": JSON.stringify({
        name: "@studio/ChannelShader", version: "1.0.0", description: "fixture", license: "MIT",
        files: ["main.tsx"],
        fourier: {
          entry: "main.tsx", type: "shader", summary: "fixture", instruction: "Use in tests",
          useCases: ["tests"], tags: ["test"], style: ["minimal"],
        },
      }),
      "package/components/ChannelShader/main.tsx": shaderSource,
    };
    const bytes = await new Bun.Archive(files, { compress: "gzip" }).bytes();
    const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    const fetcher = (async (input: RequestInfo | URL) => String(input).endsWith("/1.0.0")
      ? Response.json({
          name: "@studio/components", version: "1.0.0",
          dist: { tarball: "https://registry.npmjs.org/@studio/components/-/components-1.0.0.tgz", integrity },
        })
      : new Response(Uint8Array.from(bytes).buffer)) as typeof globalThis.fetch;

    const prepared = await prepareWorldPackage(npmUrl, fetcher);
    try {
      expect(prepared.components.map((component) => component.artifact.kind)).toEqual(["react", "shader"]);
      expect(prepared.components[0]!.preview).toMatchObject({
        mimeType: "video/mp4", width: 32, height: 24, fps: 60, totalFrames: 60, durationSeconds: 1,
      });
      expect(prepared.components[1]!.preview).toMatchObject({
        mimeType: "video/mp4", width: 64, height: 64, fps: 60, totalFrames: 60, durationSeconds: 1,
      });
      for (const component of prepared.components) {
        expect(new TextDecoder().decode(component.preview.bytes.subarray(4, 8))).toBe("ftyp");
      }
    } finally {
      await prepared.cleanup();
    }
  }, 60_000);
});
