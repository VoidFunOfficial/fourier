import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createCubismAvatar, type AvatarDrawable, type AvatarParameters, type CubismCore } from "@fourier-video/sdk/avatar";
import { cubismCoreModuleSource } from "../../../fourier-core/src/cubism-assets.ts";
import { createVoidavatarCatBackend } from "./cat-backend.ts";
import { createVoidavatarHairBackend } from "./hair-backend.ts";
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
  return createCubismAvatar({ core, moc, textures: ["texture_00.png"], parameterMap: voidavatarNativeHeadMap });
};
function area(vertices: Float32Array, a: number, b: number, c: number): number {
  return (vertices[b]! - vertices[a]!) * (vertices[c + 1]! - vertices[a + 1]!)
    - (vertices[b + 1]! - vertices[a + 1]!) * (vertices[c]! - vertices[a]!);
}
function maxDelta(before: AvatarDrawable, after: AvatarDrawable): number {
  let max = 0;
  for (let i = 0; i < before.vertices.length; i += 2)
    max = Math.max(max, Math.hypot(after.vertices[i]! - before.vertices[i]!, after.vertices[i + 1]! - before.vertices[i + 1]!));
  return max;
}
function validate(before: readonly AvatarDrawable[], after: readonly AvatarDrawable[]): void {
  expect(after.map(d => d.id)).toEqual(before.map(d => d.id));
  for (let i = 0; i < before.length; i++) {
    const a = before[i]!, b = after[i]!;
    expect(b.vertices.every(Number.isFinite)).toBe(true);
    expect({ ...b, vertices: undefined }).toEqual({ ...a, vertices: undefined });
    if (a.id !== "CatHead" && a.id !== "CatTail") expect(b.vertices).toEqual(a.vertices);
    for (let j = 0; j < a.vertices.length; j += 2) {
      const x = a.vertices[j]!, y = a.vertices[j + 1]!;
      if ((a.id === "CatHead" && (y >= 1340 || (x >= 1005 && x <= 1056)))
        || (a.id === "CatTail" && Math.hypot(x - 1128, y - 1480) <= 34)) {
        expect(b.vertices[j]).toBe(x); expect(b.vertices[j + 1]).toBe(y);
      }
    }
    for (let j = 0; j < a.indices.length; j += 3) {
      const ai = a.indices[j]! * 2, bi = a.indices[j + 1]! * 2, ci = a.indices[j + 2]! * 2;
      const initial = area(a.vertices, ai, bi, ci);
      if (Math.abs(initial) > 1e-5) expect(area(b.vertices, ai, bi, ci) / initial).toBeGreaterThan(.3);
    }
  }
}

nativeTest("猫耳与尾巴保留原始纹理拓扑，面部与尾根固定且默认无改动", () => {
  const native = createBackend(), cat = createVoidavatarCatBackend(createBackend());
  try {
    const neutral = native.sample({});
    expect(cat.sample({})).toEqual(neutral);
    for (const CatTailCurl of [-1, 0, 1]) for (const CatEarL of [-1, 0, 1]) for (const CatEarR of [-1, 0, 1]) {
      const parameters = { CatTailCurl, CatEarL, CatEarR, HeadYaw: .9, HeadPitch: -.8, HeadRoll: .7 };
      validate(native.sample(parameters), cat.sample(parameters));
    }
    for (const sign of [-1, 1]) {
      const moved = cat.sample({ CatTailCurl: sign, CatEarL: sign, CatEarR: sign });
      const tail = neutral.findIndex(d => d.id === "CatTail"), head = neutral.findIndex(d => d.id === "CatHead");
      expect(maxDelta(neutral[tail]!, moved[tail]!)).toBeGreaterThan(35);
      expect(maxDelta(neutral[tail]!, moved[tail]!)).toBeLessThan(45);
      expect(maxDelta(neutral[head]!, moved[head]!)).toBeGreaterThan(8);
      expect(maxDelta(neutral[head]!, moved[head]!)).toBeLessThan(12);
    }
  } finally { cat.dispose(); native.dispose(); }
});

nativeTest("单侧猫耳独立活动，另一只耳朵及所有面部顶点保持原位", () => {
  const native = createBackend(), cat = createVoidavatarCatBackend(createBackend());
  try {
    const head = native.sample({}).find(d => d.id === "CatHead")!;
    for (const side of ["L", "R"] as const) {
      const moved = cat.sample({ [`CatEar${side}`]: 1 }).find(d => d.id === "CatHead")!;
      let changed = 0;
      for (let i = 0; i < head.vertices.length; i += 2) {
        const x = head.vertices[i]!, y = head.vertices[i + 1]!;
        if (y >= 1340 || (side === "L" ? x >= 1005 : x <= 1056)) {
          expect(moved.vertices[i]).toBe(x); expect(moved.vertices[i + 1]).toBe(y);
        } else if (moved.vertices[i] !== x || moved.vertices[i + 1] !== y) changed++;
      }
      expect(changed).toBeGreaterThan(8);
    }
  } finally { cat.dispose(); native.dispose(); }
});

nativeTest("连续尾巴卷曲与猫耳回弹无翻面无跳步，循环与乱序采样确定", () => {
  const native = createBackend(), cat = createVoidavatarCatBackend(createBackend());
  try {
    const pose = (time: number): AvatarParameters => ({
      CatTailCurl: Math.sin(time * Math.PI / 2),
      CatEarL: Math.sin(time * Math.PI), CatEarR: Math.sin(time * Math.PI * 1.5),
    });
    const neutral = native.sample({});
    const measure = (fps: number) => {
      let previous: Float32Array | undefined, previousVelocity: Float32Array | undefined;
      let maxStep = 0, maxAcceleration = 0;
      for (let i = 0; i <= fps * 12; i++) {
        const sample = cat.sample(pose(i / fps)); validate(neutral, sample);
        const values = new Float32Array(sample.filter(d => d.id === "CatHead" || d.id === "CatTail").flatMap(d => Array.from(d.vertices)));
        const velocity = new Float32Array(values.length);
        for (let j = 0; j < values.length; j += 2) {
          if (!previous) continue;
          velocity[j] = values[j]! - previous[j]!; velocity[j + 1] = values[j + 1]! - previous[j + 1]!;
          maxStep = Math.max(maxStep, Math.hypot(velocity[j]!, velocity[j + 1]!));
          if (previousVelocity) maxAcceleration = Math.max(maxAcceleration,
            Math.hypot(velocity[j]! - previousVelocity[j]!, velocity[j + 1]! - previousVelocity[j + 1]!));
        }
        previousVelocity = previous ? velocity : undefined; previous = values;
      }
      return { maxStep, maxAcceleration };
    };
    const sixty = measure(60), finer = measure(120);
    expect(sixty.maxStep).toBeLessThan(1.3);
    expect(sixty.maxAcceleration).toBeLessThan(.1);
    expect(finer.maxStep).toBeLessThan(sixty.maxStep * .51 + .002);
    expect(cat.sample(pose(0))).toEqual(cat.sample(pose(12)));
    const earlier = cat.sample(pose(2.4)); cat.sample(pose(11.2)); cat.sample(pose(.1));
    expect(cat.sample(pose(2.4))).toEqual(earlier);
  } finally { cat.dispose(); native.dispose(); }
});

nativeTest("猫动作可叠加既有发形，源样本不被修改且只释放一次", () => {
  const hair = createVoidavatarHairBackend(createBackend());
  const cat = createVoidavatarCatBackend(createVoidavatarHairBackend(createBackend()));
  try {
    const parameters = { HeadYaw: .6, HeadPitch: .7, HeadRoll: -.7, HairSway: .8, HairFan: .7,
      HairCurl: -.6, CatTailCurl: -.8, CatEarL: 1, CatEarR: -.7 };
    validate(hair.sample(parameters), cat.sample(parameters));
  } finally { cat.dispose(); hair.dispose(); }
  const backend = createBackend(); let releases = 0;
  const original = backend.sample({}), saved = original.map(d => new Float32Array(d.vertices));
  const wrapper = createVoidavatarCatBackend({ ...backend, sample: () => original, dispose() { releases++; backend.dispose(); } });
  wrapper.sample({ CatTailCurl: 1, CatEarL: -1 });
  original.forEach((d, i) => expect(d.vertices).toEqual(saved[i]!));
  expect(() => wrapper.sample({ CatTailCurl: NaN })).toThrow("finite");
  expect(() => wrapper.sample({ CatEarR: Infinity })).toThrow("finite");
  wrapper.dispose(); wrapper.dispose(); expect(releases).toBe(1);
  expect(() => wrapper.sample({})).toThrow("disposed");
});
