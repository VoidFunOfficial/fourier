import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createCubismAvatar, type AvatarDrawable, type AvatarParameters, type CubismCore } from "@fourier-video/sdk/avatar";
import { cubismCoreModuleSource } from "../../../fourier-core/src/cubism-assets.ts";
import { createVoidavatarSleeveBackend } from "./sleeve-backend.ts";
import { voidavatarNativeHeadMap } from "./native-head.ts";
import { createVoidavatarTimeline } from "./natural-timeline.ts";
import { voidavatarActionDemoActions, voidavatarActionDemoDuration } from "./gestures.ts";

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
const sleeveIds = new Set(["SleeveL", "SleeveR"]);
function sleeves(drawables: readonly AvatarDrawable[]): readonly AvatarDrawable[] { return drawables.filter(d => sleeveIds.has(d.id)); }
function area(vertices: Float32Array, a: number, b: number, c: number): number {
  return (vertices[b]! - vertices[a]!) * (vertices[c + 1]! - vertices[a + 1]!)
    - (vertices[b + 1]! - vertices[a + 1]!) * (vertices[c]! - vertices[a]!);
}
function geometry(native: readonly AvatarDrawable[], shaped: readonly AvatarDrawable[]) {
  let minimumArea = Infinity, maximumStretch = 0, maximumRootTravel = 0, maximumTipTravel = 0;
  for (let i = 0; i < native.length; i++) {
    const before = native[i]!, after = shaped[i]!;
    if (!after.vertices.every(Number.isFinite)) throw new Error(`nonfinite ${after.id}`);
    for (let j = 0; j < before.vertices.length; j += 2) {
      const travel = Math.hypot(after.vertices[j]! - before.vertices[j]!, after.vertices[j + 1]! - before.vertices[j + 1]!);
      if (before.vertices[j + 1]! <= 950) maximumRootTravel = Math.max(maximumRootTravel, travel);
      if (before.vertices[j + 1]! >= 1190) maximumTipTravel = Math.max(maximumTipTravel, travel);
    }
    for (let k = 0; k < before.indices.length; k += 3) {
      const a = before.indices[k]! * 2, b = before.indices[k + 1]! * 2, c = before.indices[k + 2]! * 2;
      const determinant = area(before.vertices, a, b, c);
      if (Math.abs(determinant) <= 1e-5) continue;
      minimumArea = Math.min(minimumArea, area(after.vertices, a, b, c) / determinant);
      const ex = before.vertices[b]! - before.vertices[a]!, ey = before.vertices[b + 1]! - before.vertices[a + 1]!;
      const fx = before.vertices[c]! - before.vertices[a]!, fy = before.vertices[c + 1]! - before.vertices[a + 1]!;
      const ux = after.vertices[b]! - after.vertices[a]!, uy = after.vertices[b + 1]! - after.vertices[a + 1]!;
      const vx = after.vertices[c]! - after.vertices[a]!, vy = after.vertices[c + 1]! - after.vertices[a + 1]!;
      const aa = (ux * fy - vx * ey) / determinant, bb = (uy * fy - vy * ey) / determinant;
      const cc = (vx * ex - ux * fx) / determinant, dd = (vy * ex - uy * fx) / determinant;
      const trace = aa * aa + bb * bb + cc * cc + dd * dd, det = aa * dd - bb * cc;
      maximumStretch = Math.max(maximumStretch, Math.sqrt((trace + Math.sqrt(Math.max(0, trace * trace - 4 * det * det))) / 2));
    }
  }
  return { minimumArea, maximumStretch, maximumRootTravel, maximumTipTravel };
}

nativeTest("袖子保留原始贴图网格与上肩缝，抬手实际移动袖口，躯干不变", () => {
  const native = createBackend(), sleeve = createVoidavatarSleeveBackend(createBackend());
  try {
    expect(sleeve.sample({})).toEqual(native.sample({}));
    const pose = { ArmL: .8, ArmR: .8, HandL: .45, HandR: -.45, SleeveFollow: .35, HeadYaw: .5, HeadPitch: -.4, HeadRoll: .6 };
    const source = native.sample(pose), output = sleeve.sample(pose);
    expect(output.map(d => d.id)).toEqual(source.map(d => d.id));
    for (let i = 0; i < source.length; i++) {
      expect({ ...output[i]!, vertices: undefined }).toEqual({ ...source[i]!, vertices: undefined });
      if (!sleeveIds.has(source[i]!.id)) expect(output[i]!.vertices).toEqual(source[i]!.vertices);
    }
    const metrics = geometry(sleeves(source), sleeves(output));
    expect(metrics.maximumRootTravel).toBe(0);
    expect(metrics.maximumTipTravel).toBeGreaterThan(240);
    expect(metrics.minimumArea).toBeGreaterThan(.25);
    expect(metrics.maximumStretch).toBeLessThan(2.2);
    const withoutWrist = sleeves(sleeve.sample({ ...pose, HandL: 0, HandR: 0 }));
    const withWrist = sleeves(output);
    const wristTravel = Math.max(...withoutWrist.flatMap((drawable, i) => Array.from({ length: drawable.vertices.length / 2 }, (_, j) =>
      Math.hypot(drawable.vertices[j * 2]! - withWrist[i]!.vertices[j * 2]!, drawable.vertices[j * 2 + 1]! - withWrist[i]!.vertices[j * 2 + 1]!))));
    expect(wristTravel).toBeGreaterThan(2);
  } finally { sleeve.dispose(); native.dispose(); }
});

nativeTest("完整手臂手腕极值组合保持三角方向和有限衣料拉伸", () => {
  const native = createBackend(), sleeve = createVoidavatarSleeveBackend(createBackend());
  try {
    const source = sleeves(native.sample({}));
    let minimumArea = Infinity, maximumStretch = 0;
    for (const arm of [-1, -.85, -.4, 0, .4, .8, .85, 1]) for (const hand of [-1, 0, 1]) for (const follow of [-1, 0, 1]) {
      const output = sleeves(sleeve.sample({ ArmL: arm, ArmR: arm, HandL: hand, HandR: hand, SleeveFollow: follow }));
      const metrics = geometry(source, output);
      expect(metrics.maximumRootTravel).toBe(0);
      minimumArea = Math.min(minimumArea, metrics.minimumArea); maximumStretch = Math.max(maximumStretch, metrics.maximumStretch);
    }
    expect(minimumArea).toBeGreaterThan(.1);
    expect(maximumStretch).toBeLessThan(2.4);
  } finally { sleeve.dispose(); native.dispose(); }
});

nativeTest("挥手与新增动作全程保持衣袖连续，乱序采样和循环相同", () => {
  const native = createBackend(), sleeve = createVoidavatarSleeveBackend(createBackend());
  try {
    const timeline = createVoidavatarTimeline({ duration: voidavatarActionDemoDuration, actions: voidavatarActionDemoActions, targets: { marker: [.7, -.2] } });
    const source = sleeves(native.sample({}));
    let minimumArea = Infinity, maximumStretch = 0, maximumTipTravel = 0;
    for (let frame = 0; frame <= voidavatarActionDemoDuration * 60; frame++) {
      const metrics = geometry(source, sleeves(sleeve.sample(timeline.sample(frame / 60))));
      if (metrics.maximumRootTravel !== 0) throw new Error(`shoulder seam moved at ${frame}`);
      minimumArea = Math.min(minimumArea, metrics.minimumArea); maximumStretch = Math.max(maximumStretch, metrics.maximumStretch);
      maximumTipTravel = Math.max(maximumTipTravel, metrics.maximumTipTravel);
    }
    expect(minimumArea).toBeGreaterThan(.25);
    expect(maximumStretch).toBeLessThan(2.2);
    expect(maximumTipTravel).toBeGreaterThan(240);
    const wave = sleeve.sample(timeline.sample(8.4));
    sleeve.sample(timeline.sample(25.1)); sleeve.sample(timeline.sample(.1));
    expect(sleeve.sample(timeline.sample(8.4))).toEqual(wave);
    expect(sleeve.sample(timeline.sample(0))).toEqual(sleeve.sample(timeline.sample(voidavatarActionDemoDuration)));
  } finally { sleeve.dispose(); native.dispose(); }
});

nativeTest("弧形衣袖连续抬放无跳步，包装不修改原样本且仅释放一次", () => {
  const backend = createBackend(); let releases = 0;
  const original = backend.sample({}), saved = original.map(d => new Float32Array(d.vertices));
  const sleeve = createVoidavatarSleeveBackend({ ...backend, sample: () => original, dispose() { releases++; backend.dispose(); } });
  const measure = (steps: number) => {
    let prior: readonly AvatarDrawable[] | undefined, maximumStep = 0;
    for (let frame = 0; frame <= steps; frame++) {
      const t = frame / steps, phase = (1 - Math.cos(t * Math.PI * 2)) / 2;
      const current = sleeves(sleeve.sample({ ArmL: .85 * phase, ArmR: .85 * phase, HandL: .7 * Math.sin(t * Math.PI * 6), HandR: -.7 * Math.sin(t * Math.PI * 6) }));
      if (prior) for (let i = 0; i < current.length; i++) for (let j = 0; j < current[i]!.vertices.length; j += 2)
        maximumStep = Math.max(maximumStep, Math.hypot(current[i]!.vertices[j]! - prior[i]!.vertices[j]!, current[i]!.vertices[j + 1]! - prior[i]!.vertices[j + 1]!));
      prior = current;
    }
    return maximumStep;
  };
  try {
    const coarse = measure(180), fine = measure(360);
    expect(coarse).toBeLessThan(8);
    expect(fine).toBeLessThan(coarse * .52);
    original.forEach((d, i) => expect(d.vertices).toEqual(saved[i]!));
    expect(() => sleeve.sample({ ArmR: NaN })).toThrow("finite");
    sleeve.dispose(); sleeve.dispose(); expect(releases).toBe(1);
    expect(() => sleeve.sample({})).toThrow("disposed");
  } finally { sleeve.dispose(); }
});
