import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RenderDiagnostic } from "../src/types.ts";
import { VisualCache } from "../src/visual-cache.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function projectDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "fourier-visual-cache-"));
  directories.push(directory);
  return directory;
}

describe("persistent visual cache", () => {
  test("原子提交无损节点媒体并在下一次读取时验证全部文件", async () => {
    const directory = await projectDirectory();
    const diagnostics: RenderDiagnostic[] = [];
    const cache = new VisualCache(directory, {
      onDiagnostic(diagnostic) { diagnostics.push(diagnostic); },
    });
    const staging = await cache.createStaging("key-1");
    const media = join(staging, "visual.mov");
    await Bun.write(media, "lossless-media");
    const committed = await cache.commit({
      key: "key-1",
      staging,
      frameCount: 2,
      visual: {
        nodeId: "panel",
        type: "media",
        path: media,
        width: 16,
        height: 9,
      },
    });
    expect(committed.path).toContain(".render-cache/visuals/v1/key-1/visual.mov");
    diagnostics.length = 0;
    const cached = await cache.load("key-1");
    expect(cached).toMatchObject({ nodeId: "panel", type: "media", cacheKey: "key-1" });
    expect(diagnostics).toContainEqual(expect.objectContaining({
      status: "cache-hit",
      scope: "visual-cache/panel",
    }));
  });

  test("文件损坏时隔离条目并返回 miss", async () => {
    const directory = await projectDirectory();
    const diagnostics: RenderDiagnostic[] = [];
    const cache = new VisualCache(directory, {
      onDiagnostic(diagnostic) { diagnostics.push(diagnostic); },
    });
    const staging = await cache.createStaging("key-corrupt");
    const path = join(staging, "static.png");
    await Bun.write(path, "valid");
    const committed = await cache.commit({
      key: "key-corrupt",
      staging,
      frameCount: 1,
      visual: {
        nodeId: "label",
        type: "static",
        path,
        width: 8,
        height: 8,
      },
    });
    await Bun.write(committed.path, "tampered");
    expect(await cache.load("key-corrupt")).toBeUndefined();
    expect(await Bun.file(cache.entryPath("key-corrupt")).exists()).toBe(false);
    expect(diagnostics).toContainEqual(expect.objectContaining({
      message: "视觉缓存条目损坏，已隔离并重新生成",
    }));
  });

  test("并发提交只保留一个完整获胜条目", async () => {
    const directory = await projectDirectory();
    const cache = new VisualCache(directory);
    const create = async (content: string) => {
      const staging = await cache.createStaging("same-key");
      const path = join(staging, "static.png");
      await Bun.write(path, content);
      return cache.commit({
        key: "same-key",
        staging,
        frameCount: 1,
        visual: {
          nodeId: "same",
          type: "static",
          path,
          width: 1,
          height: 1,
        },
      });
    };
    const [left, right] = await Promise.all([create("left"), create("right")]);
    expect(left.path).toBe(right.path);
    expect(["left", "right"]).toContain(await Bun.file(left.path).text());
  });
});
