import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { createArtifactHost } from "../src/index.ts";
import { componentFixture } from "./test-host.ts";

describe("ArtifactHost integration seam", () => {
  test("由 integrator adapter 解析 author runtime，并编译 ABI v1.1 artifact", async () => {
    const resolved: string[] = [];
    const host = createArtifactHost({
      resolveAuthorImport(specifier) {
        resolved.push(specifier);
        return Bun.resolveSync(specifier, import.meta.dir);
      },
    });
    const artifact = await host.compileVisualArtifact({
      entryPath: componentFixture("DomStaticPanel.tsx"),
    });
    expect(artifact.sdkAbiVersion).toBe(1.1);
    expect(artifact.renderer).toBe("dom-timeline");
    expect(resolved).toContain("@fourier-video/sdk");
    expect(resolved).toContain("react-dom/client");
  });

  test("同一 host 继续编译 ABI v1 wire metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-core-abi-v1-"));
    try {
      const entryPath = join(directory, "LegacyArtifact.tsx");
      await Bun.write(entryPath, `import { SDK_ARTIFACT } from "@fourier-video/sdk";
const LegacyArtifact = () => null;
Object.defineProperty(LegacyArtifact, SDK_ARTIFACT, { value: {
  package: "@fourier-video/sdk",
  sdkAbiVersion: 1,
  renderer: "dom-timeline",
  kind: "react",
  name: "LegacyArtifact",
  schema: {},
  static: true,
  component: () => <div>legacy</div>,
  designPreview: () => ({ props: {}, composition: { width: 8, height: 8, durationSeconds: 0 } }),
} });
export default LegacyArtifact;`);
      const host = createArtifactHost({
        resolveAuthorImport: (specifier) => Bun.resolveSync(specifier, import.meta.dir),
      });
      const artifact = await host.compileVisualArtifact({ entryPath });
      expect(artifact.sdkAbiVersion).toBe(1);
      expect(artifact.name).toBe("LegacyArtifact");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("Core manifest/source 不声明或静态导入 SDK", async () => {
    const packageDirectory = join(import.meta.dir, "..");
    const manifest = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
    expect(manifest.dependencies?.["@fourier-video/sdk"]).toBeUndefined();
    expect(manifest.peerDependencies?.["@fourier-video/sdk"]).toBeUndefined();

    const sourceDirectory = join(packageDirectory, "src");
    const sourceFiles = (await readdir(sourceDirectory, { recursive: true }))
      .filter((path) => extname(path) === ".ts");
    for (const relativePath of sourceFiles) {
      const source = await readFile(join(sourceDirectory, relativePath), "utf8");
      const imports = new Bun.Transpiler({ loader: "ts" }).scanImports(source);
      expect(imports.map((entry) => entry.path)).not.toContain("@fourier-video/sdk");
    }
  });
});
