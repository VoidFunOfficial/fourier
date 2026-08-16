import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorldPackageArchive } from "../src/world-archive.ts";
import { loadWorldPackage } from "../src/world-manifest.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture(files: string[]) {
  const directory = await mkdtemp(join(tmpdir(), "fourier-world-archive-"));
  directories.push(directory);
  await Bun.write(join(directory, "Component.tsx"), "export { value } from './lib/value.ts';");
  await Bun.write(join(directory, "lib/value.ts"), "export const value = 42;");
  await Bun.write(join(directory, ".env"), "SECRET=do-not-publish");
  await Bun.write(join(directory, "package.json"), JSON.stringify({
    name: "@studio/Component",
    version: "1.0.0",
    description: "Component description.",
    license: "MIT",
    files,
    fourier: {
      entry: "Component.tsx",
      type: "card",
      summary: "Summary",
      instruction: "Instruction",
      useCases: ["Demo"],
      tags: ["demo"],
      style: ["minimal"],
    },
  }));
  return { directory, loaded: await loadWorldPackage(directory) };
}

describe("Fourier World source archive", () => {
  test("只归档 package.json files 声明的文件", async () => {
    const { directory, loaded } = await fixture(["Component.tsx", "lib"]);
    const archive = await createWorldPackageArchive(loaded, [
      join(directory, "Component.tsx"),
      join(directory, "lib/value.ts"),
    ]);
    expect(archive.fileCount).toBe(3);
    expect(archive.sha256).toMatch(/^[0-9a-f]{64}$/);
    const files = await new Bun.Archive(archive.bytes).files();
    expect([...files.keys()].sort()).toEqual(["Component.tsx", "lib/value.ts", "package.json"]);
    expect(files.has(".env")).toBe(false);
  });

  test("拒绝 files 未覆盖的 artifact 依赖", async () => {
    const { directory, loaded } = await fixture(["Component.tsx"]);
    await expect(createWorldPackageArchive(loaded, [
      join(directory, "Component.tsx"),
      join(directory, "lib/value.ts"),
    ])).rejects.toThrow("artifact 依赖未包含在 package.json files 中");
  });
});
