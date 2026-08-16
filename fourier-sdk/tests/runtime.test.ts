import { describe, expect, test } from "bun:test";
import {
  createFourierPrng,
  createFourierRuntimeController,
  SdkError,
} from "../src/index.ts";

describe("ABI v1 stable runtime helpers", () => {
  test("PRNG 对相同 number/string seed 产生相同有限序列", () => {
    for (const seed of [42, "glitch"] as const) {
      const first = createFourierPrng(seed);
      const second = createFourierPrng(seed);
      const left = Array.from({ length: 8 }, () => first());
      const right = Array.from({ length: 8 }, () => second());
      expect(left).toEqual(right);
      expect(left.every((value) => value >= 0 && value < 1)).toBe(true);
    }
  });

  test("lifecycle token 的 read 回调可更新，第二 token 被拒绝", () => {
    const controller = createFourierRuntimeController(
      { width: 320, height: 180, seed: 7 },
      1_000,
    );
    const token = Symbol("first");
    let version = 1;
    const unregister = controller.bindings.registerLifecycle(token, () => ({
      fourierStart() { version = 2; },
      fourierEnd() { version = 3; },
    }));
    controller.getLifecycle()?.fourierStart();
    expect(version).toBe(2);
    expect(() => controller.bindings.registerLifecycle(Symbol("second"), () => ({
      fourierStart() {},
      fourierEnd() {},
    }))).toThrow(SdkError);
    unregister();
    expect(() => controller.getLifecycle()).toThrow(SdkError);
  });

  test("宿主 duration 必须是有限非负数", () => {
    expect(() => createFourierRuntimeController(
      { width: 1, height: 1, seed: 0 },
      Number.POSITIVE_INFINITY,
    )).toThrow(SdkError);
  });

  test("runtime context 暴露稳定 composition 时间信息并保持旧调用默认值", () => {
    const explicit = createFourierRuntimeController(
      { width: 320, height: 180, seed: 7, fps: 30, durationInFrames: 45 },
      1_500,
    );
    expect(explicit.bindings.stableContext).toEqual({
      width: 320,
      height: 180,
      seed: 7,
      fps: 30,
      durationInFrames: 45,
      durationMilliseconds: 1_500,
    });
    const compatible = createFourierRuntimeController(
      { width: 320, height: 180, seed: 7 },
      1_000,
    );
    expect(compatible.bindings.stableContext.fps).toBe(60);
    expect(compatible.bindings.stableContext.durationInFrames).toBe(60);
  });

  test("render driver 等待资源后按宿主绝对时间同步渲染", async () => {
    const controller = createFourierRuntimeController(
      { width: 320, height: 180, seed: 7 },
      2_000,
    );
    const frames: Array<{ timeMilliseconds: number; progress: number }> = [];
    let ready = false;
    controller.bindings.registerRenderDriver(Symbol("three"), {
      async ready() { ready = true; },
      render(frame) {
        frames.push({
          timeMilliseconds: frame.timeMilliseconds,
          progress: frame.progress,
        });
      },
    });

    expect(() => controller.renderFrame(500)).toThrow(SdkError);
    await controller.prepareRenderDrivers();
    expect(ready).toBe(true);
    controller.renderFrame(500);
    controller.renderFrame(2_000);
    expect(frames).toEqual([
      { timeMilliseconds: 500, progress: 0.25 },
      { timeMilliseconds: 2_000, progress: 1 },
    ]);
    expect(controller.getRenderState()).toEqual({
      driverCount: 1,
      timeMilliseconds: 2_000,
      videoSurfaces: [],
    });
  });

  test("render driver 聚合并冻结合法视频投影", async () => {
    const controller = createFourierRuntimeController(
      { width: 100, height: 50, seed: 1 },
      1_000,
    );
    controller.bindings.registerRenderDriver(Symbol("surface"), {
      ready() {},
      render() {
        return {
          videoSurfaces: [{
            videoId: "subject",
            corners: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 0, y: 50 },
              { x: 100, y: 50 },
            ],
            cornerRadiusRatio: 0.055,
          }],
        };
      },
    });
    await controller.prepareRenderDrivers();
    const result = controller.renderFrame(250);
    expect(result.videoSurfaces).toEqual([{
      videoId: "subject",
      corners: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
      cornerRadiusRatio: 0.055,
    }]);
    expect(Object.isFrozen(result.videoSurfaces)).toBe(true);
    expect(Object.isFrozen(result.videoSurfaces?.[0]?.corners)).toBe(true);
  });

  test("render driver 拒绝重复、非有限和退化视频投影", async () => {
    const surface = {
      videoId: "subject",
      corners: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
      cornerRadiusRatio: 0.055,
    } as const;
    const duplicate = createFourierRuntimeController(
      { width: 100, height: 50, seed: 1 },
      1_000,
    );
    for (const name of ["first", "second"]) {
      duplicate.bindings.registerRenderDriver(Symbol(name), {
        ready() {},
        render: () => ({ videoSurfaces: [surface] }),
      });
    }
    await duplicate.prepareRenderDrivers();
    expect(() => duplicate.renderFrame(0)).toThrow("只能绑定一个 surface");

    for (const corners of [
      [
        { x: Number.NaN, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    ] as const) {
      const invalid = createFourierRuntimeController(
        { width: 100, height: 50, seed: 1 },
        1_000,
      );
      invalid.bindings.registerRenderDriver(Symbol("invalid"), {
        ready() {},
        render: () => ({ videoSurfaces: [{ ...surface, corners }] }),
      });
      await invalid.prepareRenderDrivers();
      expect(() => invalid.renderFrame(0)).toThrow(SdkError);
    }
  });
});
