import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createAvatarMeshRig, createCubismAvatar, type AvatarBackend, type AvatarDrawable, type CubismCore } from "@fourier-video/sdk/avatar";
import { cubismCoreModuleSource } from "../../../fourier-core/src/cubism-assets.ts";
import { voidavatarDemoRig } from "./demo-rig.ts";
import { voidavatarNativeHeadMap } from "./native-head.ts";
import { createVoidavatarPaintedEyeBackend } from "./painted-eye-backend.ts";

// Core is separately licensed and optional on CI; an installed but invalid Core
// must still fail. Locally these tests run against the hash-verified official Core.
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
const headIds = ["Ahoge2", "EyeClosedL", "EyeClosedR", "EyeL", "EyeR", "FaceSkin", "HairBack", "HairClip", "HairFront", "HairSideL", "HairSideR"].sort();

// Each fixture supplies only its own backend layers. Keep the real rig ancestry
// so this still catches a head transform accidentally added to head or body.
function rigForBackend(backend: AvatarBackend) {
  const ids = new Set(backend.sample({}).map(drawable => drawable.id));
  const byId = new Map(voidavatarDemoRig.layers.map(layer => [layer.id, layer]));
  for (const id of ids) {
    let parent = byId.get(id)?.parent;
    while (parent) { ids.add(parent); parent = byId.get(parent)?.parent; }
  }
  const layers = voidavatarDemoRig.layers.filter(layer => ids.has(layer.id));
  expect(layers.some(layer => layer.id === "body")).toBe(true);
  expect(layers.some(layer => layer.id === "head")).toBe(true);
  return createAvatarMeshRig(backend, { ...voidavatarDemoRig, layers });
}
function center(drawable: AvatarDrawable): readonly [number, number] {
  let x = 0, y = 0;
  for (let i = 0; i < drawable.vertices.length; i += 2) { x += drawable.vertices[i]!; y += drawable.vertices[i + 1]!; }
  return [x / (drawable.vertices.length / 2), y / (drawable.vertices.length / 2)];
}

nativeTest("实际导出仅三个原生头部通道进入 Core，身体和眼睛由 overlay 独占", () => {
  const backend = createBackend();
  try {
    expect([...backend.supportedParameters].sort()).toEqual(["HeadPitch", "HeadRoll", "HeadYaw"]);
    const neutral = backend.sample({});
    for (const channel of ["HeadYaw", "HeadPitch", "HeadRoll"]) {
      const pose = backend.sample({ [channel]: .5 });
      const affected = pose.filter((drawable, i) => drawable.vertices.some((v, j) => Math.abs(v - neutral[i]!.vertices[j]!) > 1e-5)).map(d => d.id).sort();
      expect(affected).toEqual(headIds);
    }
    const secondary = backend.sample({ BodyYaw: .8, BodyPitch: -.8, BodyRoll: .8, Breath: 1, EyeOpenL: 0, EyeOpenR: 0, EyeX: 1, HairFront: .8, HairSide: .8 });
    secondary.forEach((drawable, i) => {
      expect(drawable.vertices).toEqual(neutral[i]!.vertices);
      expect(drawable.opacity).toBe(neutral[i]!.opacity);
    });
  } finally { backend.dispose(); }
});

nativeTest("原生头部九组合加 Z 后，overlay 不再重复施加头部变形", () => {
  const backend = createBackend();
  const rig = rigForBackend(backend);
  try {
    for (const HeadYaw of [-.4, 0, .4]) for (const HeadPitch of [-.4, 0, .4]) {
      const parameters = { HeadYaw, HeadPitch, HeadRoll: .3 };
      const native = new Map(backend.sample(parameters).map(drawable => [drawable.id, drawable]));
      const hybrid = new Map(rig.sample(parameters).map(drawable => [drawable.id, drawable]));
      for (const id of headIds) {
        expect(hybrid.has(id)).toBe(true);
        expect(hybrid.get(id)!.vertices).toEqual(native.get(id)!.vertices);
      }
    }
  } finally { rig.dispose(); }
});

nativeTest("HeadRoll 正值保持既有画布顺时针方向", () => {
  const backend = createBackend();
  try {
    const neutral = backend.sample({}).find(d => d.id === "FaceSkin")!.vertices;
    const turned = backend.sample({ HeadRoll: .5 }).find(d => d.id === "FaceSkin")!.vertices;
    let farthest = 2;
    for (let i = 4; i < neutral.length; i += 2) {
      const distance = (neutral[i]! - neutral[0]!) ** 2 + (neutral[i + 1]! - neutral[1]!) ** 2;
      const previous = (neutral[farthest]! - neutral[0]!) ** 2 + (neutral[farthest + 1]! - neutral[1]!) ** 2;
      if (distance > previous) farthest = i;
    }
    const ax = neutral[farthest]! - neutral[0]!, ay = neutral[farthest + 1]! - neutral[1]!;
    const bx = turned[farthest]! - turned[0]!, by = turned[farthest + 1]! - turned[1]!;
    const clockwiseAngle = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    expect(clockwiseAngle).toBeGreaterThan(0);
    expect(clockwiseAngle).toBeLessThan(Math.PI / 9);
  } finally { backend.dispose(); }
});

nativeTest("当前眼画稿在原生倾头后连续开合，半闭画稿与眉毛跟随头部且不回到固定锚点", () => {
  const backend = createBackend();
  const rig = rigForBackend(createVoidavatarPaintedEyeBackend(backend, "painted-eyes.png", "painted-brows.png"));
  try {
    const head = { HeadYaw: .7, HeadPitch: -.6, HeadRoll: .5, EyeArt: 0, BrowArt: 0 };
    const open = new Map(rig.sample({ ...head, EyeOpenL: 1, EyeOpenR: 1 }).map(d => [d.id, d]));
    for (const [opening, weights] of [[1, [1, 0, 0]], [.75, [.5, .5, 0]], [.5, [0, 1, 0]], [.25, [0, .5, .5]], [0, [0, 0, 1]]] as const) {
      const pose = new Map(rig.sample({ ...head, EyeOpenL: opening, EyeOpenR: 1 }).map(d => [d.id, d]));
      for (const [index, id] of ["EyeL", "EyeHalfL", "EyeClosedL"].entries()) {
        expect(pose.get(id)!.texture).toBe("painted-eyes.png");
        expect(pose.get(id)!.vertices).toEqual(open.get(id)!.vertices);
        expect(pose.get(id)!.opacity).toBe(weights[index]!);
      }
      for (const id of ["EyeR", "EyeHalfR", "EyeClosedR", "BrowL", "BrowR"]) expect(pose.get(id)).toEqual(open.get(id));
    }
    const rightClosed = new Map(rig.sample({ ...head, EyeOpenL: 1, EyeOpenR: 0 }).map(d => [d.id, d]));
    expect(rightClosed.get("EyeR")!.opacity).toBe(0);
    expect(rightClosed.get("EyeHalfR")!.opacity).toBe(0);
    expect(rightClosed.get("EyeClosedR")!.opacity).toBe(1);
    for (const side of ["L", "R"]) {
      const artwork = [`Eye${side}`, `EyeHalf${side}`, `EyeClosed${side}`].map(id => open.get(id)!);
      expect(new Set(artwork.map(drawable => JSON.stringify(Array.from(drawable.uvs)))).size).toBe(3);
      expect(open.get(`Brow${side}`)!.texture).toBe("painted-brows.png");
    }

    // A native Z-only turn is rigid. Compare the painted quads with the actual
    // native-eye centers, independently of the backend's affine fitting code.
    const neutral = new Map(rig.sample({ EyeArt: 0, BrowArt: 0 }).map(d => [d.id, d]));
    const nativeNeutral = new Map(backend.sample({}).map(d => [d.id, d]));
    const HeadRoll = .5, angle = HeadRoll * Math.PI / 12, cos = Math.cos(angle), sin = Math.sin(angle);
    const turned = new Map(rig.sample({ HeadRoll, EyeArt: 0, BrowArt: 0 }).map(d => [d.id, d]));
    const nativeTurned = new Map(backend.sample({ HeadRoll }).map(d => [d.id, d]));
    for (const side of ["L", "R"]) {
      const before = center(nativeNeutral.get(`Eye${side}`)!), after = center(nativeTurned.get(`Eye${side}`)!);
      for (const id of [`Eye${side}`, `EyeHalf${side}`, `EyeClosed${side}`, `Brow${side}`]) {
        const rest = neutral.get(id)!.vertices, current = turned.get(id)!.vertices;
        expect(current).not.toEqual(rest);
        for (let i = 0; i < current.length; i += 2) {
          const x = rest[i]! - before[0], y = rest[i + 1]! - before[1];
          expect(Math.abs(current[i]! - (after[0] + cos * x - sin * y))).toBeLessThan(.001);
          expect(Math.abs(current[i + 1]! - (after[1] + sin * x + cos * y))).toBeLessThan(.001);
        }
      }
    }
  } finally { rig.dispose(); }
});
