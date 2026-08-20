import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { openArtifact } from "../src/testing.ts";

const describeDom = Bun.env.RUN_DOM_TESTS === "1" ? describe : describe.skip;

describeDom("SDK testing ABI v1 path Adapter", () => {
  test("openArtifact 支持 renderTime/frames|times determinism", async () => {
    const fixture = await openArtifact(join(import.meta.dir, "fixtures/DomTestingPanel.tsx"));
    try {
      const first = await fixture.renderTime({ time: { numerator: 1, denominator: 2 } });
      const frame = await fixture.renderFrame({ frame: 30 });
      expect(frame.sha256).toBe(first.sha256);
      await fixture.assertDeterministic({
        times: [{ numerator: 0, denominator: 1 }, { numerator: 1, denominator: 2 }],
      });
      await expect(fixture.assertDeterministic({ frames: [], times: [] } as never))
        .rejects.toMatchObject({ code: "INVALID_DETERMINISM_REQUEST" });
    } finally {
      await fixture.close();
    }
  }, 20_000);

  test("Example3D 加载 GLB 并由 Fourier 绝对时间驱动旋转", async () => {
    const fixture = await openArtifact(join(import.meta.dir, "../example/Example3D.tsx"));
    try {
      expect(fixture.isStatic).toBe(false);
      const first = await fixture.renderFrame({ frame: 0 });
      const quarterTurn = await fixture.renderFrame({ frame: 90 });
      expect(first.sha256).not.toBe(quarterTurn.sha256);
      await fixture.assertDeterministic({ frames: [0, 90, 180, 359] });
    } finally {
      await fixture.close();
    }
  }, 40_000);

  test("VideoPanel 输出单一投影 surface 并按 Y/X 弹簧时间复位", async () => {
    const fixture = await openArtifact(join(import.meta.dir, "../example/VideoPanel.tsx"));
    try {
      const front = await fixture.renderFrame({ frame: 0 });
      const yPeak = await fixture.renderFrame({ frame: 45 });
      const yReturned = await fixture.renderFrame({ frame: 90 });
      const xPeak = await fixture.renderFrame({ frame: 135 });
      const finished = await fixture.renderFrame({ frame: 180 });

      for (const sample of [front, yPeak, yReturned, xPeak, finished]) {
        expect(sample.videoSurfaces).toHaveLength(1);
        expect(sample.videoSurfaces[0]?.videoId).toBe("subject");
        expect(sample.videoSurfaces[0]?.cornerRadiusRatio).toBe(0.055);
      }
      expect(yPeak.videoSurfaces[0]?.corners).not.toEqual(
        front.videoSurfaces[0]?.corners,
      );
      expect(xPeak.videoSurfaces[0]?.corners).not.toEqual(
        front.videoSurfaces[0]?.corners,
      );
      expect(yReturned.videoSurfaces[0]?.corners).toEqual(
        front.videoSurfaces[0]?.corners,
      );
      expect(finished.videoSurfaces[0]?.corners).toEqual(
        front.videoSurfaces[0]?.corners,
      );
      expect(yPeak.sha256).not.toBe(front.sha256);
      expect(xPeak.sha256).not.toBe(front.sha256);
      expect(yReturned.sha256).toBe(front.sha256);
      expect(finished.sha256).toBe(front.sha256);
      await fixture.assertDeterministic({ frames: [0, 45, 90, 135, 180] });
    } finally {
      await fixture.close();
    }
  }, 50_000);

  test("Universe 通过标准 SDK subpath 编译并确定性投影普通 React 结果", async () => {
    const fixture = await openArtifact(join(import.meta.dir, "fixtures/UniversePanel.tsx"));
    try {
      expect(fixture.isStatic).toBe(false);
      const origin = await fixture.renderFrame({ frame: 0 });
      const moving = await fixture.renderFrame({ frame: 30 });
      const destination = await fixture.renderFrame({ frame: 60 });
      expect(origin.sha256).not.toBe(moving.sha256);
      expect(moving.sha256).not.toBe(destination.sha256);
      await fixture.assertDeterministic({ frames: [60, 0, 30, 119] });
    } finally {
      await fixture.close();
    }
  }, 40_000);

  test("Universe Camera Cut 在任意有理采样时间保持不连续切换", async () => {
    const fixture = await openArtifact(join(import.meta.dir, "fixtures/UniverseProgramPanel.tsx"));
    try {
      const red = await fixture.renderFrame({ frame: 0 });
      const lastRed = await fixture.renderTime({
        time: { numerator: 29_999, denominator: 60_000 },
      });
      const blue = await fixture.renderTime({ time: { numerator: 1, denominator: 2 } });
      expect(lastRed.sha256).toBe(red.sha256);
      expect(blue.sha256).not.toBe(red.sha256);
      await fixture.assertDeterministic({
        times: [
          { numerator: 29_999, denominator: 60_000 },
          { numerator: 1, denominator: 2 },
        ],
      });
    } finally {
      await fixture.close();
    }
  }, 40_000);

  test("Universe3D 固定 xyz 并在每次大幅转镜后依次显隐四张卡片", async () => {
    const fixture = await openArtifact(join(import.meta.dir, "../example/Universe3DCameraExample.tsx"));
    try {
      const black = await fixture.renderFrame({ frame: 0 });
      const thisIs = await fixture.renderFrame({ frame: 76 });
      const fourier = await fixture.renderFrame({ frame: 252 });
      const camera = await fixture.renderFrame({ frame: 428 });
      const example = await fixture.renderFrame({ frame: 610 });
      expect(thisIs.sha256).not.toBe(black.sha256);
      expect(fourier.sha256).not.toBe(thisIs.sha256);
      expect(camera.sha256).not.toBe(fourier.sha256);
      expect(example.sha256).not.toBe(camera.sha256);
      await fixture.assertDeterministic({ frames: [610, 76, 428, 252, 0] });
    } finally {
      await fixture.close();
    }
  }, 60_000);

  test("ABI v1.1 在调用原生 animate 前拒绝倒序 keyframe offset", async () => {
    await expect(openArtifact(join(import.meta.dir, "fixtures/InvalidMotionOffsets.tsx")))
      .rejects.toMatchObject({ code: "INVALID_TIMELINE_KEYFRAME_OFFSETS" });
  }, 20_000);

});
