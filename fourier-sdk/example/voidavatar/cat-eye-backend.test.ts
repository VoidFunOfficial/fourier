import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createCubismAvatar, type AvatarDrawable, type AvatarParameters, type CubismCore } from "@fourier-video/sdk/avatar";
import { cubismCoreModuleSource } from "../../../fourier-core/src/cubism-assets.ts";
import { createVoidavatarCatBackend } from "./cat-backend.ts";
import { createVoidavatarCatEyeBackend } from "./cat-eye-backend.ts";
import { voidavatarNativeHeadMap } from "./native-head.ts";

const module = await cubismCoreModuleSource().catch((error: unknown) => {
  if (error instanceof Error && "code" in error && error.code === "CUBISM_CORE_REQUIRED") return undefined;
  throw error;
});
const core: CubismCore | undefined = module === undefined ? undefined : await runInNewContext(module.replace("export function createCore", "function createCore") + "\ncreateCore();", { console: { log() {}, warn() {}, error() {} }, atob });
const nativeTest = core ? test : test.skip;
const bytes = await readFile(new URL("./cubism/voidavatar.moc3", import.meta.url));
const moc = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const createBackend = () => {
  if (!core) throw new Error("This test requires the separately installed Cubism Core");
  return createVoidavatarCatBackend(createCubismAvatar({ core, moc, textures: ["texture_00.png"], parameterMap: voidavatarNativeHeadMap }));
};
function area(vertices: Float32Array, a: number, b: number, c: number): number {
  return (vertices[b]! - vertices[a]!) * (vertices[c + 1]! - vertices[a + 1]!)
    - (vertices[b + 1]! - vertices[a + 1]!) * (vertices[c]! - vertices[a]!);
}
function totalArea(drawable: AvatarDrawable): number {
  let sum = 0;
  for (let i = 0; i < drawable.indices.length; i += 3)
    sum += area(drawable.vertices, drawable.indices[i]! * 2, drawable.indices[i + 1]! * 2, drawable.indices[i + 2]! * 2);
  return sum;
}
function compare(open: readonly AvatarDrawable[], closed: readonly AvatarDrawable[]): void {
  expect(closed.map(d => d.id)).toEqual(open.map(d => d.id));
  for (let i = 0; i < open.length; i++) {
    const a = open[i]!, b = closed[i]!;
    expect({ ...b, vertices: undefined }).toEqual({ ...a, vertices: undefined });
    expect(b.vertices.every(Number.isFinite)).toBe(true);
    if (a.id !== "CatHead") { expect(b.vertices).toEqual(a.vertices); continue; }
    for (let j = 0; j < a.vertices.length; j += 2) {
      const x = a.vertices[j]!, y = a.vertices[j + 1]!;
      expect(b.vertices[j]).toBe(x);
      const eyeArea = (Math.abs(x - 990.2038) < 28 && Math.abs(y - 1392.2936) < 32)
        || (Math.abs(x - 1064.8915) < 28 && Math.abs(y - 1392.1635) < 32);
      if (!eyeArea) expect(b.vertices[j + 1]).toBe(y);
    }
    for (let j = 0; j < a.indices.length; j += 3) {
      const ai = a.indices[j]! * 2, bi = a.indices[j + 1]! * 2, ci = a.indices[j + 2]! * 2;
      const before = area(a.vertices, ai, bi, ci);
      if (Math.abs(before) > 1e-5) expect(area(b.vertices, ai, bi, ci) / before).toBeGreaterThan(.025);
    }
  }
}

nativeTest("固定细分保持睁眼原画几何、UV和面积，其他部件完全相同", () => {
  const source = createBackend(), eyes = createVoidavatarCatEyeBackend(createBackend());
  try {
    const before = source.sample({}), open = eyes.sample({});
    for (let i = 0; i < before.length; i++) {
      const a = before[i]!, b = open[i]!;
      if (a.id !== "CatHead") { expect(b).toEqual(a); continue; }
      expect(b.vertices.length).toBeGreaterThan(a.vertices.length * 20);
      expect(b.vertices.subarray(0, a.vertices.length)).toEqual(a.vertices);
      expect(b.uvs.subarray(0, a.uvs.length)).toEqual(a.uvs);
      expect({ ...b, vertices: undefined, uvs: undefined, indices: undefined }).toEqual({ ...a, vertices: undefined, uvs: undefined, indices: undefined });
      expect(Math.abs(totalArea(a) - totalArea(b))).toBeLessThan(.1);
      // The unchanged rest canvas and atlas are affine. New UVs and positions
      // must describe the same texture samples, not a new crop or silhouette.
      for (let j = 0; j < b.vertices.length; j += 2) {
        expect(Math.abs(b.vertices[j]! - b.uvs[j]! * 4096 - 77.9773)).toBeLessThan(.001);
        expect(Math.abs(b.vertices[j + 1]! - b.uvs[j + 1]! * 4096 + 88.0227)).toBeLessThan(.001);
      }
    }
    expect(eyes.sample({ CatEyeOpenL: 1, CatEyeOpenR: 1 })).toEqual(open);
  } finally { eyes.dispose(); source.dispose(); }
});

nativeTest("双眼半闭、闭眼及不对称眨眼保持嘴与轮廓，白眼压成细弧且无翻面", () => {
  const eyes = createVoidavatarCatEyeBackend(createBackend());
  try {
    for (const CatEyeOpenL of [0, .5, 1]) for (const CatEyeOpenR of [0, .5, 1]) {
      const parameters = { CatEyeOpenL, CatEyeOpenR, CatEarL: .9, CatEarR: -.7, CatTailCurl: .85, HeadYaw: .7, HeadPitch: -.8, HeadRoll: .8 };
      compare(eyes.sample({ ...parameters, CatEyeOpenL: 1, CatEyeOpenR: 1 }), eyes.sample(parameters));
    }
    const open = eyes.sample({}).find(d => d.id === "CatHead")!;
    const closed = eyes.sample({ CatEyeOpenL: 0, CatEyeOpenR: 0 }).find(d => d.id === "CatHead")!;
    for (const [cx, cy] of [[990.2038, 1392.2936], [1064.8915, 1392.1635]]) {
      const ys: number[] = [], closedYs: number[] = [];
      for (let i = 0; i < open.vertices.length; i += 2) {
        if (Math.abs(open.vertices[i]! - cx!) <= 5 && Math.abs(open.vertices[i + 1]! - cy!) <= 13) {
          ys.push(open.vertices[i + 1]!); closedYs.push(closed.vertices[i + 1]!);
        }
      }
      expect(ys.length).toBeGreaterThan(20);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(20);
      expect(Math.max(...closedYs) - Math.min(...closedYs)).toBeLessThan(2.7);
    }
    const wink = eyes.sample({ CatEyeOpenL: 0, CatEyeOpenR: 1 }).find(d => d.id === "CatHead")!;
    for (let i = 0; i < open.vertices.length; i += 2) if (open.vertices[i]! > 1020) {
      expect(wink.vertices[i]).toBe(open.vertices[i]); expect(wink.vertices[i + 1]).toBe(open.vertices[i + 1]);
    }
  } finally { eyes.dispose(); }
});

nativeTest("猫咪慢眨眼连续闭合再睁开，拓扑稳定且乱序采样确定", () => {
  const eyes = createVoidavatarCatEyeBackend(createBackend());
  try {
    const open = eyes.sample({});
    const pose = (time: number): AvatarParameters => ({ CatEyeOpenL: (1 + Math.cos(time * Math.PI * 2)) / 2,
      CatEyeOpenR: (1 + Math.cos(time * Math.PI * 2 + .12)) / 2 });
    let previous: Float32Array | undefined, previousVelocity: Float32Array | undefined;
    let maxStep = 0, maxAcceleration = 0;
    for (let frame = 0; frame <= 60; frame++) {
      const sample = eyes.sample(pose(frame / 60)); compare(open, sample);
      const vertices = sample.find(d => d.id === "CatHead")!.vertices;
      const velocity = new Float32Array(vertices.length);
      for (let i = 1; i < vertices.length; i += 2) {
        if (!previous) continue;
        velocity[i] = vertices[i]! - previous[i]!;
        maxStep = Math.max(maxStep, Math.abs(velocity[i]!));
        if (previousVelocity) maxAcceleration = Math.max(maxAcceleration, Math.abs(velocity[i]! - previousVelocity[i]!));
      }
      previousVelocity = previous ? velocity : undefined; previous = vertices;
    }
    expect(maxStep).toBeLessThan(1.1); expect(maxAcceleration).toBeLessThan(.12);
    const first = eyes.sample(pose(0)); expect(eyes.sample(pose(1))).toEqual(first);
    const half = eyes.sample(pose(.25)); eyes.sample(pose(.75)); eyes.sample(pose(.05));
    expect(eyes.sample(pose(.25))).toEqual(half);
  } finally { eyes.dispose(); }
});

nativeTest("闭眼包装保留底层样本与资源所有权，并拒绝非有限参数", () => {
  const backend = createBackend(); let releases = 0;
  const original = backend.sample({}), saved = original.map(d => new Float32Array(d.vertices));
  const eyes = createVoidavatarCatEyeBackend({ ...backend, sample: () => original, dispose() { releases++; backend.dispose(); } });
  eyes.sample({ CatEyeOpenL: 0, CatEyeOpenR: .5 });
  original.forEach((d, i) => expect(d.vertices).toEqual(saved[i]!));
  expect(() => eyes.sample({ CatEyeOpenL: NaN })).toThrow("finite");
  expect(() => eyes.sample({ CatEyeOpenR: Infinity })).toThrow("finite");
  expect(eyes.sample({ CatEyeOpenL: -5, CatEyeOpenR: 5 })).toEqual(eyes.sample({ CatEyeOpenL: 0, CatEyeOpenR: 1 }));
  eyes.dispose(); eyes.dispose(); expect(releases).toBe(1);
  expect(() => eyes.sample({})).toThrow("disposed");
});
