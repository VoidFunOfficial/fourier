import { describe, expect, test } from "bun:test";
import { SdkError } from "../src/errors.ts";
import {
  camera3DMatrix,
  camera3DPerspective,
  defineCamera3D,
  resolveCamera3DFrames,
  world3DMatrix,
} from "../src/universe-3d-core.ts";

describe("Universe3D spatial kernel", () => {
  test("defineCamera3D 冻结 xyz/rxyz 默认值并拒绝非法定义", () => {
    const camera = defineCamera3D({});
    expect(camera.fov).toBe(50);
    expect(camera.initial).toEqual({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
    expect(camera.moves).toEqual([]);
    expect(Object.isFrozen(camera)).toBe(true);
    expect(Object.isFrozen(camera.initial)).toBe(true);
    expect(() => defineCamera3D({ fov: 180 })).toThrow(SdkError);
    expect(() => defineCamera3D({
      moves: [{ at: "0f", duration: "1s", to: {} }],
    })).toThrow("至少需要一个");
  });

  test("Camera3D Move 只更新声明轴且相机位置可保持不变", () => {
    const camera = defineCamera3D({
      initial: { x: 10, y: 20, z: 30, rx: 1, ry: 2, rz: 3 },
      moves: [
        {
          at: "10f",
          duration: "10f",
          to: { ry: -24, rz: 5 },
          ease: "linear",
        },
        {
          at: "20f",
          duration: "5f",
          to: { ry: -20 },
          ease: "ease-out",
        },
      ],
    });
    const frames = resolveCamera3DFrames({
      camera,
      fps: 30,
      durationInFrames: 30,
    });
    expect(frames[0]?.pose).toMatchObject({ x: 10, y: 20, z: 30, ry: 2 });
    expect(frames[15]?.pose).toMatchObject({ x: 10, y: 20, z: 30, ry: -11, rz: 4 });
    expect(frames[20]?.pose).toMatchObject({ x: 10, y: 20, z: 30, ry: -24, rz: 5 });
    expect(frames[25]?.pose).toMatchObject({ x: 10, y: 20, z: 30, ry: -20, rz: 5 });
  });

  test("Three.js matrix 与透视投影在相同输入下稳定", () => {
    const camera = defineCamera3D({
      fov: 60,
      initial: { x: 10, y: -20, z: 30, rx: 5, ry: -15, rz: 2 },
    });
    const first = camera3DMatrix(camera.initial);
    const second = camera3DMatrix(camera.initial);
    expect(first).toBe(second);
    expect(first).toStartWith("matrix3d(");
    expect(camera3DPerspective(camera, 1080)).toBeCloseTo(935.307436, 5);
    expect(world3DMatrix({ x: 100, y: 20, z: -900, ry: -12, scale: 1.2 }))
      .toStartWith("matrix3d(");
  });

  test("Camera3D Move overlap 与超出 duration 使用稳定错误码", () => {
    const resolve = (camera: ReturnType<typeof defineCamera3D>) => resolveCamera3DFrames({
      camera,
      fps: 30,
      durationInFrames: 20,
    });
    expect(() => resolve(defineCamera3D({
      moves: [
        { at: "0f", duration: "10f", to: { ry: 10 } },
        { at: "9f", duration: "2f", to: { ry: 20 } },
      ],
    }))).toThrow("重叠");
    expect(() => resolve(defineCamera3D({
      moves: [{ at: "19f", duration: "2f", to: { ry: 10 } }],
    }))).toThrow("超出 artifact duration");
  });
});
