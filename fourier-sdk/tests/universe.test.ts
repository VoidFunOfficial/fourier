import { describe, expect, test } from "bun:test";
import { SdkError } from "../src/errors.ts";
import {
  classifyWorldVisibility,
  defineCamera,
  defineCameraProgram,
  projectWorldPoint,
  resolveUniverseFrames,
  resolveUniverseSourceFrames,
  unprojectViewportPoint,
  worldPolygon,
  type CameraFitMode,
  type CameraPath,
  type WorldBounds,
} from "../src/universe-core.ts";

function bounds(
  id: string,
  input: Partial<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    scale: number;
    cull: "auto" | "never";
  }> = {},
): WorldBounds {
  const resolved = {
    x: input.x ?? 0,
    y: input.y ?? 0,
    width: input.width ?? 100,
    height: input.height ?? 50,
    rotation: input.rotation ?? 0,
    scale: input.scale ?? 1,
  };
  return Object.freeze({
    id,
    polygon: worldPolygon({
      id,
      ...resolved,
      anchor: { x: 0.5, y: 0.5 },
    }),
    cull: input.cull ?? "auto",
    element: {} as HTMLElement,
  });
}

describe("Universe spatial kernel", () => {
  test("defineCamera freezes normalized defaults and rejects invalid definitions", () => {
    const camera = defineCamera({ width: 1920, height: 1080 });
    expect(camera.initial).toEqual({ x: 0, y: 0, zoom: 1, rotation: 0 });
    expect(camera.moves).toEqual([]);
    expect(Object.isFrozen(camera)).toBe(true);
    expect(Object.isFrozen(camera.initial)).toBe(true);
    expect(() => defineCamera({ width: 0, height: 1080 })).toThrow(SdkError);
    expect(() => defineCamera({
      width: 1920,
      height: 1080,
      moves: [{
        at: "nope",
        duration: "1s",
        to: { kind: "pose", x: 10 },
      }],
    })).toThrow("不是有效时间");
  });

  test("World anchor、rotation 和 scale 形成稳定世界四边形", () => {
    expect(worldPolygon({
      id: "card",
      x: -2_000,
      y: 400,
      width: 100,
      height: 50,
      anchor: { x: 0.5, y: 0.5 },
      rotation: 0,
      scale: 2,
    })).toEqual([
      { x: -2_100, y: 350 },
      { x: -1_900, y: 350 },
      { x: -1_900, y: 450 },
      { x: -2_100, y: 450 },
    ]);
  });

  test("世界与 viewport 投影互为逆变换且分辨率不改变构图", () => {
    const pose = { x: 1_000, y: 500, zoom: 1.5, rotation: 30, width: 1920, height: 1080 };
    const point = { x: 1_400, y: 250 };
    const hd = projectWorldPoint(point, pose, 1920, 1080);
    const uhd = projectWorldPoint(point, pose, 3840, 2160);
    expect(uhd.x / 2).toBeCloseTo(hd.x, 10);
    expect(uhd.y / 2).toBeCloseTo(hd.y, 10);
    expect(unprojectViewportPoint(hd, pose, 1920, 1080).x).toBeCloseTo(point.x, 10);
    expect(unprojectViewportPoint(hd, pose, 1920, 1080).y).toBeCloseTo(point.y, 10);
  });

  test("Camera pose Move、Bezier Path、空档保持和时间帧解析", () => {
    const camera = defineCamera({
      width: 200,
      height: 100,
      moves: [{
        at: "10f",
        duration: "10f",
        to: { kind: "pose", x: 100, y: 50, zoom: 2, rotation: 90 },
        path: {
          kind: "bezier",
          control1: { x: 0, y: 100 },
          control2: { x: 100, y: 100 },
        },
        ease: "linear",
      }],
    });
    const frames = resolveUniverseFrames({
      camera,
      worlds: new Map(),
      fps: 10,
      durationInFrames: 30,
      viewportWidth: 400,
      viewportHeight: 200,
    });
    expect(frames[9]?.pose.x).toBe(0);
    expect(frames[15]?.pose.x).toBeCloseTo(50, 10);
    expect(frames[15]?.pose.y).toBeCloseTo(81.25, 10);
    expect(frames[15]?.pose.zoom).toBeCloseTo(1.5, 10);
    expect(frames[20]?.pose).toMatchObject({ x: 100, y: 50, zoom: 2, rotation: 90 });
    expect(frames[29]?.pose.x).toBe(100);
  });

  test("arc、curve 和 deterministic custom path 使用同一 Camera Motion 语义", () => {
    const resolve = (path: CameraPath) => resolveUniverseFrames({
        camera: defineCamera({
          width: 200,
          height: 100,
          initial: { x: 0, y: 0 },
          moves: [{ at: "0f", duration: "10f", to: { kind: "pose", x: 100, y: 0 }, path }],
        }),
        worlds: new Map(),
        fps: 10,
        durationInFrames: 10,
        viewportWidth: 200,
        viewportHeight: 100,
      });
    const arc = resolve({
      kind: "arc",
      center: { x: 50, y: 0 },
      direction: "clockwise",
    });
    expect(arc[5]?.pose.x).toBeCloseTo(50, 10);
    expect(Math.abs(arc[5]!.pose.y)).toBeCloseTo(50, 10);

    const curve = resolve({ kind: "curve", points: [{ x: 50, y: 80 }] });
    expect(curve[5]?.pose).toMatchObject({ x: 50, y: 80 });

    const custom = resolve({
      kind: "custom",
      sample(progress, context) {
        return {
          x: context.start.x + (context.end.x - context.start.x) * progress,
          y: Math.sin(progress * Math.PI) * 20,
        };
      },
    });
    expect(custom[5]?.pose).toMatchObject({ x: 50, y: 20 });

    let value = 0;
    expect(() => resolve({
      kind: "custom",
      sample() { value += 1; return { x: value, y: 0 }; },
    })).toThrow("相同输入返回了不同结果");
  });

  test("Camera Program 用独立 Cut 切换命名 Camera", () => {
    const program = defineCameraProgram({
      cameras: {
        overview: defineCamera({ width: 200, height: 100 }),
        detail: defineCamera({ width: 200, height: 100, initial: { x: 100, zoom: 2 } }),
      },
      initialCamera: "overview",
      cuts: [{ at: "10f", to: "detail" }],
    });
    const frames = resolveUniverseSourceFrames({
      camera: program,
      worlds: new Map(),
      fps: 10,
      durationInFrames: 20,
      viewportWidth: 200,
      viewportHeight: 100,
    });
    expect(frames[9]?.pose).toMatchObject({ x: 0, zoom: 1 });
    expect(frames[10]?.pose).toMatchObject({ x: 100, zoom: 2 });
    expect(frames[9]?.cut).toBeUndefined();
    expect(frames[10]?.cut).toBe(true);
    expect(Object.isFrozen(program.cameras)).toBe(true);
  });

  for (const [fit, expectedZoom] of [
    ["contain", 2],
    ["cover", 5],
    ["width", 2],
    ["height", 5],
  ] as const satisfies readonly (readonly [CameraFitMode, number])[]) {
    test(`Camera Fit ${fit} 解析静态 World bounds`, () => {
      const target = bounds("target", { x: 300, y: 50, width: 100, height: 20 });
      const frames = resolveUniverseFrames({
        camera: defineCamera({
          width: 200,
          height: 100,
          moves: [{
            at: "0f",
            duration: "1f",
            to: { kind: "fit", target: "target", fit },
          }],
        }),
        worlds: new Map([[target.id, target]]),
        fps: 30,
        durationInFrames: 2,
        viewportWidth: 400,
        viewportHeight: 200,
      });
      expect(frames[1]?.pose).toMatchObject({ x: 300, y: 50, zoom: expectedZoom });
    });
  }

  test("Fit padding、缺失 target、Move overlap/out-of-range 和宽高比稳定报错", () => {
    const target = bounds("target", { width: 100, height: 20 });
    const padded = resolveUniverseFrames({
      camera: defineCamera({
        width: 200,
        height: 100,
        moves: [{
          at: "0f",
          duration: "1f",
          to: { kind: "fit", target: "target", fit: "contain", padding: 20 },
        }],
      }),
      worlds: new Map([[target.id, target]]),
      fps: 30,
      durationInFrames: 2,
      viewportWidth: 400,
      viewportHeight: 200,
    });
    expect(padded[1]?.pose.zoom).toBeCloseTo(1.6, 10);

    const request = (camera: ReturnType<typeof defineCamera>) => resolveUniverseFrames({
      camera,
      worlds: new Map(),
      fps: 30,
      durationInFrames: 10,
      viewportWidth: 200,
      viewportHeight: 100,
    });
    expect(() => request(defineCamera({
      width: 200,
      height: 100,
      moves: [{ at: "0f", duration: "1f", to: { kind: "fit", target: "missing", fit: "contain" } }],
    }))).toThrow("找不到 World");
    expect(() => request(defineCamera({
      width: 200,
      height: 100,
      moves: [
        { at: "0f", duration: "5f", to: { kind: "pose", x: 1 } },
        { at: "4f", duration: "1f", to: { kind: "pose", x: 2 } },
      ],
    }))).toThrow("重叠");
    expect(() => request(defineCamera({
      width: 200,
      height: 100,
      moves: [{ at: "9f", duration: "2f", to: { kind: "pose", x: 1 } }],
    }))).toThrow("超出 artifact duration");
    expect(() => request(defineCamera({ width: 100, height: 100 })))
      .toThrow("宽高比不一致");
  });

  test("旋转 frustum 区分 visible、near-visible、invisible 与 cull=never", () => {
    const pose = { x: 0, y: 0, zoom: 1, rotation: 30, width: 200, height: 100 };
    expect(classifyWorldVisibility(bounds("visible", { x: 0 }), pose, 0.25)).toBe("visible");
    expect(classifyWorldVisibility(bounds("near", { x: 135, width: 10, height: 10 }), pose, 0.5))
      .toBe("near-visible");
    expect(classifyWorldVisibility(bounds("far", { x: 1_000 }), pose, 0.5)).toBe("invisible");
    expect(classifyWorldVisibility(bounds("always", { x: 1_000, cull: "never" }), pose, 0))
      .toBe("visible");
  });
});
