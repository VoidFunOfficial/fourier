import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareWorldPackage } from "../src/world-publish.ts";

const directories: string[] = [];
const run = Bun.env.RUN_DOM_TESTS === "1" && Bun.env.RUN_FFMPEG_TESTS === "1";
const describeIntegration = run ? describe : describe.skip;

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describeIntegration("Fourier World publish preparation", () => {
  test("在本地用 Core 生成 MP4，并与源码归档一起准备上传", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-world-publish-test-"));
    directories.push(directory);
    await Bun.write(
      join(directory, "MetricPanel.tsx"),
      await Bun.file(join(import.meta.dir, "fixtures/DomTestingPanel.tsx")).text(),
    );
    await Bun.write(join(directory, "package.json"), JSON.stringify({
      name: "@studio/DomTestingPanel",
      version: "1.0.0",
      description: "Render Engine publish integration fixture.",
      license: "MIT",
      files: ["MetricPanel.tsx"],
      fourier: {
        entry: "./MetricPanel.tsx",
        type: "card",
        summary: "Render Engine preview fixture.",
        instruction: "Use in SDK publish integration tests.",
        useCases: ["Integration testing"],
        tags: ["testing"],
        style: ["minimal"],
      },
    }));

    const prepared = await prepareWorldPackage(directory);

    expect(prepared.componentPackage.componentName).toBe("DomTestingPanel");
    expect(prepared.archive.bytes.byteLength).toBeGreaterThan(0);
    expect(prepared.preview).toMatchObject({
      mimeType: "video/mp4",
      width: 32,
      height: 24,
      fps: 60,
      totalFrames: 60,
      durationSeconds: 1,
    });
    expect(prepared.preview.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(new TextDecoder().decode(prepared.preview.bytes.subarray(4, 8))).toBe("ftyp");
  }, 30_000);
});
