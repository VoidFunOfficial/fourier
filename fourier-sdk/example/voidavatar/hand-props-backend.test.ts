import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createAvatarMeshRig, createCubismAvatar, type AvatarDrawable, type AvatarParameters, type CubismCore } from "@fourier-video/sdk/avatar";
import { cubismCoreModuleSource } from "../../../fourier-core/src/cubism-assets.ts";
import { createVoidavatarHandPropsBackend, type HandPropDefinition } from "./hand-props-backend.ts";
import { createVoidavatarSleeveBackend } from "./sleeve-backend.ts";
import { voidavatarNativeHeadMap } from "./native-head.ts";
import { voidavatarDemoRig } from "./demo-rig.ts";
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
  return createVoidavatarSleeveBackend(createCubismAvatar({ core, moc, textures: ["texture_00.png"], parameterMap: voidavatarNativeHeadMap }));
};
const definitions: readonly HandPropDefinition[] = Array.from({ length: 10 }, (_, i) => ({ id: `item${i + 1}`, texture: `item${i + 1}.png`,
  region: [.1, .05, .9, .95], grip: [.5, .8], canvas: [200, 400], height: 190 + i * 5 }));
const extraIds = new Set(["HandPropL", "HandPropR", "HandGripL", "HandGripR"]);
function item(drawables: readonly AvatarDrawable[], id: string): AvatarDrawable {
  const result = drawables.find(d => d.id === id); if (!result) throw new Error(`missing ${id}`); return result;
}
function pointOnMesh(drawable: AvatarDrawable, neutral: AvatarDrawable, x: number, y: number): readonly [number, number] {
  for (let i = 0; i < neutral.indices.length; i += 3) {
    const a = neutral.indices[i]! * 2, b = neutral.indices[i + 1]! * 2, c = neutral.indices[i + 2]! * 2;
    const ex = neutral.vertices[b]! - neutral.vertices[a]!, ey = neutral.vertices[b + 1]! - neutral.vertices[a + 1]!;
    const fx = neutral.vertices[c]! - neutral.vertices[a]!, fy = neutral.vertices[c + 1]! - neutral.vertices[a + 1]!;
    const determinant = ex * fy - ey * fx; if (Math.abs(determinant) < 1e-8) continue;
    const u = ((x - neutral.vertices[a]!) * fy - (y - neutral.vertices[a + 1]!) * fx) / determinant;
    const v = (ex * (y - neutral.vertices[a + 1]!) - ey * (x - neutral.vertices[a]!)) / determinant;
    if (Math.min(u, v, 1 - u - v) >= -1e-4) return [drawable.vertices[a]! * (1 - u - v) + drawable.vertices[b]! * u + drawable.vertices[c]! * v,
      drawable.vertices[a + 1]! * (1 - u - v) + drawable.vertices[b + 1]! * u + drawable.vertices[c + 1]! * v];
  }
  throw new Error("grip outside reference");
}
function spriteGrip(drawable: AvatarDrawable, definition: HandPropDefinition): readonly [number, number] {
  const u = (definition.grip[0] - definition.region[0]) / (definition.region[2] - definition.region[0]);
  const v = (definition.grip[1] - definition.region[1]) / (definition.region[3] - definition.region[1]);
  return [drawable.vertices[0]! + u * (drawable.vertices[2]! - drawable.vertices[0]!) + v * (drawable.vertices[6]! - drawable.vertices[0]!),
    drawable.vertices[1]! + u * (drawable.vertices[3]! - drawable.vertices[1]!) + v * (drawable.vertices[7]! - drawable.vertices[1]!)];
}
function distance(a: readonly number[], b: readonly number[]): number { return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!); }
function dimensions(drawable: AvatarDrawable): readonly [number, number, number] {
  const v = drawable.vertices, ux = v[2]! - v[0]!, uy = v[3]! - v[1]!, vx = v[6]! - v[0]!, vy = v[7]! - v[1]!;
  return [Math.hypot(ux, uy), Math.hypot(vx, vy), ux * vx + uy * vy];
}

nativeTest("无道具保留原画与固定透明层，十种左右选择保留各自贴图和遮挡层次", () => {
  const source = createBackend(), props = createVoidavatarHandPropsBackend(createBackend(), definitions);
  try {
    const parameters = { ArmL: .4, ArmR: .7, HandR: -.5, HeadYaw: .4 };
    const originals = source.sample(parameters), none = props.sample(parameters);
    expect(none.filter(d => !extraIds.has(d.id))).toEqual([...originals]);
    expect(none.filter(d => extraIds.has(d.id)).map(d => d.opacity)).toEqual([0, 0, 0, 0]);
    expect(props.textures).toEqual(["texture_00.png", ...definitions.map(d => d.texture)]);
    for (let index = 1; index <= 10; index++) {
      const drawables = props.sample({ ...parameters, HandPropL: index, HandPropR: 11 - index, PropOpacity: .6 });
      expect(drawables.filter(d => !extraIds.has(d.id))).toEqual([...originals]);
      expect(item(drawables, "HandPropL").texture).toBe(definitions[index - 1]!.texture);
      expect(item(drawables, "HandPropR").texture).toBe(definitions[10 - index]!.texture);
      for (const side of ["L", "R"]) {
        const prop = item(drawables, `HandProp${side}`), grip = item(drawables, `HandGrip${side}`), sleeve = item(drawables, `Sleeve${side}`);
        expect(prop.opacity).toBe(.6); expect(grip.opacity).toBe(.6);
        expect(prop.order).toBeGreaterThan(Math.max(...originals.map(drawable => drawable.order))); expect(grip.order).toBeGreaterThan(prop.order);
        expect(grip.texture).toBe(sleeve.texture); expect(grip.vertices.length).toBeLessThan(sleeve.vertices.length);
        expect(grip.uvs.every(n => Number.isFinite(n) && n >= 0 && n <= 1)).toBe(true);
      }
    }
  } finally { props.dispose(); source.dispose(); }
});

nativeTest("道具握点逐帧跟随真正袖口网格，物体在挥手及所有新增动作中保持刚性", () => {
  const source = createBackend(), props = createVoidavatarHandPropsBackend(createBackend(), definitions);
  try {
    const neutral = source.sample({});
    const timeline = createVoidavatarTimeline({ duration: voidavatarActionDemoDuration, actions: voidavatarActionDemoActions, targets: { marker: [.7, -.2] } });
    let greatestDrift = 0, greatestDimensionError = 0, greatestPerpendicularError = 0;
    for (let frame = 0; frame <= voidavatarActionDemoDuration * 60; frame++) {
      const parameters = { ...timeline.sample(frame / 60), HandPropL: 2, HandPropR: 7 };
      const drawables = props.sample(parameters);
      for (const side of ["L", "R"]) {
        const definition = definitions[side === "L" ? 1 : 6]!, prop = item(drawables, `HandProp${side}`);
        const palm = pointOnMesh(item(drawables, `Sleeve${side}`), item(neutral, `Sleeve${side}`), side === "L" ? 475 : 939, 1211);
        greatestDrift = Math.max(greatestDrift, distance(palm, spriteGrip(prop, definition)));
        const [width, height, perpendicular] = dimensions(prop);
        const expectedWidth = definition.height * (.8 * 200) / (.9 * 400);
        greatestDimensionError = Math.max(greatestDimensionError, Math.abs(height - definition.height), Math.abs(width - expectedWidth));
        greatestPerpendicularError = Math.max(greatestPerpendicularError, Math.abs(perpendicular) / (width * height));
      }
    }
    expect(greatestDrift).toBeLessThan(.0003); expect(greatestDimensionError).toBeLessThan(.0003); expect(greatestPerpendicularError).toBeLessThan(.000003);
    const before = props.sample({ ArmR: .65, HandR: .3, HandPropR: 2 });
    props.sample({ ArmR: -.4, HandPropR: 9 }); props.sample({ HandPropL: 1 });
    expect(props.sample({ ArmR: .65, HandR: .3, HandPropR: 2 })).toEqual(before);
  } finally { props.dispose(); source.dispose(); }
});

nativeTest("身体弹跳和倾斜后握点保持重合，道具角度尺度不移动握点，零透明度不影响原画", () => {
  const source = createBackend(), backend = createVoidavatarHandPropsBackend(createBackend(), definitions);
  const relevant = new Set(["body", "SleeveL", "SleeveR", "HoodieTorso", ...extraIds]);
  const rig = createAvatarMeshRig(backend, { ...voidavatarDemoRig, layers: voidavatarDemoRig.layers.filter(layer => relevant.has(layer.id)) });
  try {
    const neutral = source.sample({});
    for (const scale of [.5, 1, 1.5]) for (const angle of [-45, 0, 45]) {
      const drawables = rig.sample({ ArmL: .62, ArmR: .55, HandL: .45, HandR: -.7, HandPropL: 1, HandPropR: 1,
        BodyRoll: .65, BodyBounce: .7, BodySquash: -.5, PropScale: scale, PropAngle: angle });
      for (const side of ["L", "R"]) {
        const palm = pointOnMesh(item(drawables, `Sleeve${side}`), item(neutral, `Sleeve${side}`), side === "L" ? 475 : 939, 1211);
        expect(distance(palm, spriteGrip(item(drawables, `HandProp${side}`), definitions[0]!))).toBeLessThan(.0004);
      }
    }
    const hidden = rig.sample({ HandPropL: 1, HandPropR: 3, PropOpacity: 0 });
    expect(hidden.filter(d => extraIds.has(d.id)).every(d => d.opacity === 0)).toBe(true);
    const none = rig.sample({});
    expect(hidden.filter(d => !extraIds.has(d.id))).toEqual(none.filter(d => !extraIds.has(d.id)));
  } finally { rig.dispose(); source.dispose(); }
});

nativeTest("手部遮挡层只裁原掌心并沿原UV变形，不把衣袖大片复制到道具前", () => {
  const backend = createVoidavatarHandPropsBackend(createBackend(), definitions);
  try {
    const drawables = backend.sample({ HandPropL: 1, HandPropR: 1 });
    for (const side of ["L", "R"]) {
      const patch = item(drawables, `HandGrip${side}`), sleeve = item(drawables, `Sleeve${side}`);
      for (let i = 0; i < patch.vertices.length; i += 2) {
        expect(patch.vertices[i + 1]!).toBeGreaterThanOrEqual(1182.99);
        expect(patch.vertices[i + 1]!).toBeLessThanOrEqual(1240.01);
        expect(patch.vertices[i]!).toBeGreaterThanOrEqual(side === "L" ? 439.99 : 909.99);
        expect(patch.vertices[i]!).toBeLessThanOrEqual(side === "L" ? 504.01 : 974.01);
        const mapped = pointOnMesh({ ...sleeve, vertices: sleeve.uvs }, sleeve, patch.vertices[i]!, patch.vertices[i + 1]!);
        expect(distance(mapped, [patch.uvs[i]!, patch.uvs[i + 1]!])).toBeLessThan(.000003);
      }
    }
  } finally { backend.dispose(); }
});

nativeTest("非法输入拒绝、原样本不变、透明占位支持空清单、重复释放只向上一次", () => {
  const source = createBackend(), original = source.sample({}), saved = original.map(d => new Float32Array(d.vertices)); let releases = 0;
  const props = createVoidavatarHandPropsBackend({ ...source, sample: () => original, dispose() { releases++; source.dispose(); } }, definitions);
  try {
    props.sample({ ArmR: .8, HandPropL: 2, HandPropR: 5 });
    original.forEach((d, i) => expect(d.vertices).toEqual(saved[i]!));
    for (const bad of [{ HandPropL: .5 }, { HandPropR: 11 }, { HandPropR: -1 }, { PropScale: NaN }, { PropAngle: Infinity }, { PropOpacity: NaN }])
      expect(() => props.sample(bad)).toThrow();
    expect(() => createVoidavatarHandPropsBackend(source, [{ ...definitions[0]!, grip: [2, .5] }])).toThrow("invalid");
    expect(() => createVoidavatarHandPropsBackend(source, [definitions[0]!, definitions[0]!])).toThrow("unique");
    props.dispose(); props.dispose(); expect(releases).toBe(1); expect(() => props.sample({})).toThrow("disposed");
  } finally { props.dispose(); }
  const empty = createVoidavatarHandPropsBackend(createBackend(), []);
  try { expect(empty.sample({}).filter(d => extraIds.has(d.id)).every(d => d.opacity === 0)).toBe(true); }
  finally { empty.dispose(); }
});


nativeTest("握持由当前掌心顶点驱动，不依赖Arm参数猜测，局部拉伸不拉长道具", () => {
  const upstream = createBackend();
  const props = createVoidavatarHandPropsBackend({ ...upstream, sample(parameters) {
    const angle = parameters.TestPalmAngle ?? 0, factor = parameters.TestPalmScale ?? 1;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return upstream.sample(parameters).map(drawable => {
      if (drawable.id !== "SleeveR") return drawable;
      const vertices = new Float32Array(drawable.vertices);
      for (let i = 0; i < vertices.length; i += 2) {
        const x = drawable.vertices[i]! - 939, y = drawable.vertices[i + 1]! - 1211;
        vertices[i] = 939 + (parameters.TestPalmX ?? 0) + factor * (cos * x - sin * y);
        vertices[i + 1] = 1211 + (parameters.TestPalmY ?? 0) + factor * (sin * x + cos * y);
      }
      return { ...drawable, vertices };
    });
  } }, definitions);
  try {
    const rest = item(props.sample({ HandPropR: 1 }), "HandPropR");
    const angle = .37;
    const moved = item(props.sample({ HandPropR: 1, TestPalmAngle: angle, TestPalmScale: 1.2, TestPalmX: 24, TestPalmY: -31 }), "HandPropR");
    expect(distance(spriteGrip(moved, definitions[0]!), [963, 1180])).toBeLessThan(.0003);
    const restSize = dimensions(rest), movedSize = dimensions(moved);
    expect(Math.abs(movedSize[0] - restSize[0])).toBeLessThan(.0003);
    expect(Math.abs(movedSize[1] - restSize[1])).toBeLessThan(.0003);
    const baselineAngle = Math.atan2(rest.vertices[3]! - rest.vertices[1]!, rest.vertices[2]! - rest.vertices[0]!);
    const actualAngle = Math.atan2(moved.vertices[3]! - moved.vertices[1]!, moved.vertices[2]! - moved.vertices[0]!);
    expect(Math.abs(actualAngle - baselineAngle - angle)).toBeLessThan(.000003);
  } finally { props.dispose(); }
});
