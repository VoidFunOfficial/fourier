import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorldPackage, WorldManifestError } from "../src/world-manifest.ts";

const directories: string[] = [];

async function packageDirectory(overrides: Record<string, unknown> = {}): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "fourier-world-manifest-"));
  directories.push(directory);
  await Bun.write(join(directory, "WorldCard.tsx"), "export default {};");
  await Bun.write(join(directory, "package.json"), JSON.stringify({
    name: "@studio/WorldCard",
    version: "1.2.3",
    description: "A reusable information card for product videos.",
    license: "MIT",
    files: ["WorldCard.tsx"],
    fourier: {
      entry: "./WorldCard.tsx",
      type: "card",
      summary: "在产品视频中展示结构化指标。",
      instruction: "需要清晰展示一组关键指标时使用。",
      useCases: ["产品功能介绍", "数据摘要"],
      negativeUseCases: ["全屏电影片头"],
      aliases: ["metric panel"],
      tags: ["metrics", "product"],
      style: ["minimal", "corporate"],
      contentDomains: ["SaaS"],
      mood: ["restrained"],
      languages: ["en", "zh-CN"],
    },
    ...overrides,
  }, null, 2));
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Fourier World package.json", () => {
  test("读取标准字段和 fourier 语义字段", async () => {
    const directory = await packageDirectory();
    const loaded = await loadWorldPackage(directory);
    expect(loaded).toMatchObject({
      namespace: "@studio",
      componentName: "WorldCard",
      entryPath: join(directory, "WorldCard.tsx"),
      manifest: {
        name: "@studio/WorldCard",
        version: "1.2.3",
        license: "MIT",
        files: ["WorldCard.tsx"],
        fourier: {
          type: "card",
          style: ["minimal", "corporate"],
          languages: ["en", "zh-CN"],
        },
      },
    });
  });

  test("拒绝缺失 package.json 的目录", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-world-empty-"));
    directories.push(directory);
    await expect(loadWorldPackage(directory)).rejects.toThrow("publish 目录必须包含 package.json");
  });

  test("一次报告必填字段、枚举和入口问题", async () => {
    const directory = await packageDirectory({
      name: "WorldCard",
      version: "latest",
      license: "Apache-2.0",
      fourier: {
        entry: "../Outside.tsx",
        type: "widget",
        summary: "x".repeat(181),
        instruction: "",
        useCases: [],
        tags: [],
        style: ["minimal", "unknown", "corporate", "editorial"],
      },
    });
    let thrown: unknown;
    try {
      await loadWorldPackage(directory);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(WorldManifestError);
    const message = String((thrown as Error).message);
    expect(message).toContain("name 必须是 @namespace/ComponentName");
    expect(message).toContain("version 必须是 semver");
    expect(message).toContain("license 当前只支持 MIT");
    expect(message).toContain("fourier.type 必须是");
    expect(message).toContain("fourier.summary 不能超过 180");
    expect(message).toContain("fourier.entry 不能指向 package.json 目录之外");
  });
});
