import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createCubismAvatar, type AvatarDrawable, type AvatarParameters, type CubismCore } from "@fourier-video/sdk/avatar";
import { cubismCoreModuleSource } from "../../../fourier-core/src/cubism-assets.ts";
import { createVoidavatarHairBackend } from "./hair-backend.ts";
import { voidavatarNativeHeadMap } from "./native-head.ts";
import { createVoidavatarTimeline } from "./natural-timeline.ts";

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
  return createCubismAvatar({ core, moc, textures: ["texture_00.png"], parameterMap: voidavatarNativeHeadMap });
};
const hairIds = new Set(["HairBack", "HairSideL", "HairSideR", "HairFront", "Ahoge2"]);
const shapes: readonly AvatarParameters[] = [
  { HairSway: -.82, HairSide: -.35, HairBack: -.24, HairFront: -.18 },
  { HairSway: .82, HairSide: .35, HairBack: .24, HairFront: .18 },
  { HairFan: .8, HairCurl: -.45 },
  { HairCurl: .8, HairFan: .08 },
  { HairSway: .25, HairFan: .36, HairCurl: -.82, HairFront: .35 },
];
function maxDelta(a: readonly AvatarDrawable[], b: readonly AvatarDrawable[]): number {
  return Math.max(...a.flatMap((drawable, i) => Array.from({ length: drawable.vertices.length / 2 }, (_, j) =>
    Math.hypot(drawable.vertices[j * 2]! - b[i]!.vertices[j * 2]!, drawable.vertices[j * 2 + 1]! - b[i]!.vertices[j * 2 + 1]!))));
}
function area(vertices: Float32Array, a: number, b: number, c: number): number {
  return (vertices[b]! - vertices[a]!) * (vertices[c + 1]! - vertices[a + 1]!)
    - (vertices[b + 1]! - vertices[a + 1]!) * (vertices[c]! - vertices[a]!);
}
function validate(native: readonly AvatarDrawable[], shaped: readonly AvatarDrawable[]): void {
  expect(shaped.map(d => d.id)).toEqual(native.map(d => d.id));
  for (let i = 0; i < native.length; i++) {
    const before = native[i]!, after = shaped[i]!;
    expect(after.vertices.every(Number.isFinite)).toBe(true);
    // Colors, UVs, masks, opacity, triangle topology and render order are all inherited.
    expect({ ...after, vertices: undefined }).toEqual({ ...before, vertices: undefined });
    if (!hairIds.has(before.id)) expect(after.vertices).toEqual(before.vertices);
    for (let k = 0; k < before.indices.length; k += 3) {
      const a = before.indices[k]! * 2, b = before.indices[k + 1]! * 2, c = before.indices[k + 2]! * 2;
      const start = area(before.vertices, a, b, c);
      if (Math.abs(start) > 1e-5) expect(area(after.vertices, a, b, c) / start).toBeGreaterThanOrEqual(.1499);
    }
  }
}

nativeTest("发形保留当前原生网格、发根、发夹与非头发部件，五种轮廓确实可见", () => {
  const native = createBackend(), hair = createVoidavatarHairBackend(createBackend());
  try {
    const neutral = native.sample({});
    expect(hair.sample({})).toEqual(neutral);
    const signatures = new Set<string>();
    for (const shape of shapes) {
      const parameters = { ...shape, HeadYaw: .6, HeadPitch: -.5, HeadRoll: .7 };
      const source = native.sample(parameters), output = hair.sample(parameters);
      validate(source, output);
      expect(maxDelta(source, output)).toBeGreaterThan(35);
      expect(maxDelta(source, output)).toBeLessThan(140);
      signatures.add(JSON.stringify(output.filter(d => hairIds.has(d.id)).map(d => Array.from(d.vertices))));
      for (let i = 0; i < neutral.length; i++) {
        const rest = neutral[i]!;
        if (!hairIds.has(rest.id)) continue;
        const ys = Array.from(rest.vertices).filter((_, index) => index % 2 === 1), minY = Math.min(...ys), maxY = Math.max(...ys);
        for (let j = 0; j < rest.vertices.length; j += 2) {
          const y = rest.vertices[j + 1]!;
          const root = rest.id === "HairFront" ? y <= 620 : rest.id === "Ahoge2" ? y >= maxY - .18 * (maxY - minY) : y <= minY + .18 * (maxY - minY);
          if (root) {
            expect(output[i]!.vertices[j]).toBe(source[i]!.vertices[j]);
            expect(output[i]!.vertices[j + 1]).toBe(source[i]!.vertices[j + 1]);
          }
        }
      }
    }
    expect(signatures.size).toBe(5);
  } finally { hair.dispose(); native.dispose(); }
});

nativeTest("原生头部27组合叠加五种发形，不翻面、不压塌薄三角", () => {
  const native = createBackend(), hair = createVoidavatarHairBackend(createBackend());
  try {
    for (const HeadYaw of [-1, 0, 1]) for (const HeadPitch of [-1, 0, 1]) for (const HeadRoll of [-1, 0, 1]) {
      for (const shape of [...shapes, { HairSway: 1, HairFan: 1, HairCurl: 1, HairFront: 1, HairBack: 1, HairSide: 1 },
        { HairSway: -1, HairFan: 1, HairCurl: -1, HairFront: -1, HairBack: -1, HairSide: -1 }]) {
        const parameters = { ...shape, HeadYaw, HeadPitch, HeadRoll };
        validate(native.sample(parameters), hair.sample(parameters));
      }
    }
  } finally { hair.dispose(); native.dispose(); }
});

nativeTest("发形方向跟随原生Z转头，不围绕旧画布锚点漂移", () => {
  const native = createBackend(), hair = createVoidavatarHairBackend(createBackend());
  try {
    const shape = { HairSway: .6, HairFan: .4, HairCurl: -.2 };
    const unturned = native.sample(shape), shaped = hair.sample(shape);
    for (const HeadRoll of [-1, 1]) {
      const source = native.sample({ ...shape, HeadRoll }), turned = hair.sample({ ...shape, HeadRoll });
      const angle = HeadRoll * Math.PI / 12, cos = Math.cos(angle), sin = Math.sin(angle);
      for (let i = 0; i < source.length; i++) for (let j = 0; j < source[i]!.vertices.length; j += 2) {
        const dx = shaped[i]!.vertices[j]! - unturned[i]!.vertices[j]!, dy = shaped[i]!.vertices[j + 1]! - unturned[i]!.vertices[j + 1]!;
        expect(Math.abs(turned[i]!.vertices[j]! - source[i]!.vertices[j]! - cos * dx + sin * dy)).toBeLessThan(.002);
        expect(Math.abs(turned[i]!.vertices[j + 1]! - source[i]!.vertices[j + 1]! - sin * dx - cos * dy)).toBeLessThan(.002);
      }
    }
  } finally { hair.dispose(); native.dispose(); }
});

nativeTest("默认及最大待机幅度保持网格有效、循环与乱序采样一致", () => {
  const native = createBackend(), hair = createVoidavatarHairBackend(createBackend());
  try {
    for (const intensity of [1, 1.5]) {
      const timeline = createVoidavatarTimeline({ duration: 12 }, intensity);
      for (let i = 0; i <= 120; i++) {
        const parameters = timeline.sample(i / 10);
        validate(native.sample(parameters), hair.sample(parameters));
      }
      const first = hair.sample(timeline.sample(0)), last = hair.sample(timeline.sample(12));
      expect(maxDelta(first, last)).toBeLessThan(.001);
      const earlier = hair.sample(timeline.sample(2.7));
      hair.sample(timeline.sample(11.8)); hair.sample(timeline.sample(.1));
      expect(hair.sample(timeline.sample(2.7))).toEqual(earlier);
    }
  } finally { hair.dispose(); native.dispose(); }
});

nativeTest("发形包装不修改底层样本且只释放一次", () => {
  const backend = createBackend(); let releases = 0;
  const original = backend.sample({}), saved = original.map(d => new Float32Array(d.vertices));
  const hair = createVoidavatarHairBackend({ ...backend, sample: () => original, dispose() { releases++; backend.dispose(); } });
  hair.sample(shapes[0]!);
  original.forEach((d, i) => expect(d.vertices).toEqual(saved[i]!));
  expect(() => hair.sample({ HairCurl: NaN })).toThrow("finite");
  hair.dispose(); hair.dispose(); expect(releases).toBe(1);
  expect(() => hair.sample({})).toThrow("disposed");
});

nativeTest("连续发形限幅不在相邻帧产生跳步或突变残差速度", () => {
  const native = createBackend(), hair = createVoidavatarHairBackend(createBackend());
  try {
    const measure = (poses: readonly AvatarParameters[]) => {
      let previous: Float32Array | undefined, previousVelocity: Float32Array | undefined;
      let maxResidualStep = 0, maxVelocityChange = 0, maxTipDelta = 0, maxVelocityFrame = 0, maxVelocityVertex = 0;
      for (const [frame, pose] of poses.entries()) {
        const source = native.sample(pose).filter(d => hairIds.has(d.id)), shaped = hair.sample(pose).filter(d => hairIds.has(d.id));
        const residual = new Float32Array(shaped.flatMap((d, i) => Array.from(d.vertices, (value, j) => value - source[i]!.vertices[j]!)));
        const velocity = new Float32Array(residual.length);
        for (let j = 0; j < residual.length; j += 2) {
          maxTipDelta = Math.max(maxTipDelta, Math.hypot(residual[j]!, residual[j + 1]!));
          if (!previous) continue;
          velocity[j] = residual[j]! - previous[j]!; velocity[j + 1] = residual[j + 1]! - previous[j + 1]!;
          maxResidualStep = Math.max(maxResidualStep, Math.hypot(velocity[j]!, velocity[j + 1]!));
          if (previousVelocity) {
            const change = Math.hypot(velocity[j]! - previousVelocity[j]!, velocity[j + 1]! - previousVelocity[j + 1]!);
            if (change > maxVelocityChange) { maxVelocityChange = change; maxVelocityFrame = frame; maxVelocityVertex = j / 2; }
          }
        }
        previousVelocity = previous ? velocity : undefined; previous = residual;
      }
      return { maxResidualStep, maxVelocityChange, maxTipDelta, maxVelocityFrame, maxVelocityVertex };
    };
    for (const intensity of [1, 1.5]) {
      const timeline = createVoidavatarTimeline({ duration: 12 }, intensity);
      const metrics = measure(Array.from({ length: 721 }, (_, frame) => timeline.sample(frame / 60)));
      expect(metrics.maxResidualStep).toBeLessThan(4);
      expect(metrics.maxVelocityChange).toBeLessThan(.5);
      expect(metrics.maxTipDelta).toBeGreaterThan(40);
      // Halving the timestep must halve displacement too; a discrete limiter pop would not.
      const finer = measure(Array.from({ length: 1441 }, (_, frame) => timeline.sample(frame / 120)));
      expect(finer.maxResidualStep).toBeLessThan(metrics.maxResidualStep * .56 + .002);
    }
    const channels = ["HairSway", "HairFan", "HairCurl", "HairFront", "HairBack", "HairSide"];
    for (let i = 0; i < shapes.length; i++) {
      const from = shapes[i]!, to = shapes[(i + 1) % shapes.length]!;
      const metrics = measure(Array.from({ length: 61 }, (_, frame) => {
        const t = frame / 60, smooth = t * t * (3 - 2 * t);
        return { HeadYaw: .65, HeadPitch: -.55, HeadRoll: .7,
          ...Object.fromEntries(channels.map(key => [key, (from[key] ?? 0) * (1 - smooth) + (to[key] ?? 0) * smooth])) };
      }));
      expect(metrics.maxResidualStep).toBeLessThan(7);
      expect(metrics.maxVelocityChange).toBeLessThan(.8);
    }
  } finally { hair.dispose(); native.dispose(); }
});
