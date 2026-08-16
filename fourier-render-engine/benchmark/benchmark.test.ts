import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProject } from "../src/project-compiler.ts";
import {
  createBenchmarkOptions,
  generateBenchmarkTsx,
  parseBenchmarkResolutions,
  RESOLUTIONS,
} from "./benchmark.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("Fourier TSX benchmark generator", () => {
  test("规范化公开 benchmark 选项并校验范围", () => {
    const options = createBenchmarkOptions({
      resolutions: parseBenchmarkResolutions("1080p,4K,1080p"),
      frames: 12,
      seed: 42,
      outputDirectory: "relative-results",
    });
    expect(options.resolutions).toEqual(["1080p", "4k"]);
    expect(options.frames).toBe(12);
    expect(options.seed).toBe(42);
    expect(options.outputDirectory.startsWith("/")).toBe(true);
    expect(() => createBenchmarkOptions({ frames: 11 })).toThrow("frames");
    expect(() => parseBenchmarkResolutions("720p")).toThrow("未知分辨率");
  });

  test("同一种子生成完全相同的 1080p TSX", () => {
    const options = {
      resolution: RESOLUTIONS["1080p"],
      frames: 30,
      fps: 30,
      seed: 20260727,
      iteration: 1,
    };
    expect(generateBenchmarkTsx(options)).toBe(generateBenchmarkTsx(options));
  });

  test("1080p、4k、8k 样本均覆盖全部节点和 V1 修饰", async () => {
    for (const [index, resolution] of Object.values(RESOLUTIONS).entries()) {
      const directory = await mkdtemp(join(tmpdir(), "fourier-benchmark-tsx-"));
      temporaryDirectories.push(directory);
      const projectPath = join(directory, "main.tsx");
      await Bun.write(
        projectPath,
        generateBenchmarkTsx({
          resolution,
          frames: 12,
          fps: 30,
          seed: 1000 + index,
          iteration: 1,
        }),
      );
      const project = await loadProject(projectPath, { validateAssets: false });

      expect(project.metadata.version).toBe("1.0");
      expect(project.canvas).toMatchObject({
        width: resolution.width,
        height: resolution.height,
        fps: 30,
      });
      expect(project.totalFrames).toBe(12);
      expect(new Set(project.nodes.map((node) => node.kind))).toEqual(
        new Set(["video", "audio", "image", "text", "subtitle", "react"]),
      );
      expect(new Set(project.groups.map((group) => group.mode))).toEqual(
        new Set(["parallel", "sequence"]),
      );
      expect(
        project.nodes.some((node) =>
          node.kind !== "audio" &&
          node.modifiers.some((modifier) => modifier.kind === "motion")
        ),
      ).toBe(true);
      expect(
        project.nodes.some((node) =>
          node.kind !== "audio" &&
          node.modifiers.some((modifier) => modifier.kind === "transform")
        ),
      ).toBe(true);
    }
  });
});
