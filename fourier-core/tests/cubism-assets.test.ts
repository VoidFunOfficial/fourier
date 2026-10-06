import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cubismAssetFiles } from "../src/cubism-assets.ts";

async function fixture(run: (root: string, model: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "fourier-cubism-test-"));
  try {
    const model = join(root, "model"); await mkdir(model);
    await writeFile(join(model, "avatar.moc3"), "MOC3fixture");
    await writeFile(join(model, "texture.png"), "fixture");
    await writeFile(join(model, "avatar.model3.json"), JSON.stringify({ Version: 3, FileReferences: { Moc: "avatar.moc3", Textures: ["texture.png"] } }));
    await run(root, model);
  } finally { await rm(root, { recursive: true, force: true }); }
}

describe("Cubism 本地资源边界", () => {
  test("moc3 和 model3 入口自动解析同一套资源", () => fixture(async (_, model) => {
    const fromMoc = await cubismAssetFiles(join(model, "avatar.moc3"));
    expect(fromMoc).toEqual(await cubismAssetFiles(join(model, "avatar.model3.json")));
    expect(fromMoc.textures).toHaveLength(1);
  }));
  test("缺少 model3、路径越界、网络引用均明确失败", () => fixture(async (root, model) => {
    await expect(cubismAssetFiles(join(model, "missing.moc3"))).rejects.toThrow("同目录同名");
    await writeFile(join(root, "outside.png"), "outside");
    for (const texture of ["../outside.png", "https://example.test/texture.png"]) {
      await writeFile(join(model, "avatar.model3.json"), JSON.stringify({ Version: 3, FileReferences: { Moc: "avatar.moc3", Textures: [texture] } }));
      await expect(cubismAssetFiles(join(model, "avatar.moc3"))).rejects.toThrow("模型目录");
    }
  }));
  test("纹理符号链接也不能逃出模型目录", () => fixture(async (root, model) => {
    await writeFile(join(root, "outside.png"), "outside");
    await symlink(join(root, "outside.png"), join(model, "linked.png"));
    await writeFile(join(model, "avatar.model3.json"), JSON.stringify({ Version: 3, FileReferences: { Moc: "avatar.moc3", Textures: ["linked.png"] } }));
    await expect(cubismAssetFiles(join(model, "avatar.moc3"))).rejects.toThrow("模型目录");
  }));
});
