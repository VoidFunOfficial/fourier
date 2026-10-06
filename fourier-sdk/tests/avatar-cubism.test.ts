import { describe, expect, test } from "bun:test";
import { createCubismAvatar, cubismModelReferences, decodeAvatarMoc, type CubismCore, type CubismCoreModel } from "../src/avatar.ts";

function fixture() {
  let releases = 0;
  const model: CubismCoreModel = {
    parameters: { ids: ["ParamAngleX", "ParamEyeLOpen"], values: new Float32Array(2), minimumValues: new Float32Array([-30, 0]), maximumValues: new Float32Array([30, 1]), defaultValues: new Float32Array([0, 1]) },
    parts: { opacities: new Float32Array([1]) },
    canvasinfo: { CanvasWidth: 100, CanvasHeight: 100, PixelsPerUnit: 50, CanvasOriginX: 50, CanvasOriginY: 50 },
    drawables: { ids: ["face"], textureIndices: new Int32Array([0]), vertexPositions: [new Float32Array([-1, 1, 1, 1, 1, -1])], vertexUvs: [new Float32Array([0, 1, 1, 1, 1, 0])], indices: [new Uint16Array([0, 1, 2])], opacities: new Float32Array([1]), renderOrders: new Int32Array([0]), masks: [new Int32Array()], constantFlags: new Uint8Array([0]), dynamicFlags: new Uint8Array([1]), resetDynamicFlags() {} },
    update() {}, release() { releases++; },
  };
  const core: CubismCore = { Moc: { fromArrayBuffer: () => ({ _release() { releases++; } }) }, Model: { fromMoc: () => model } };
  return { model, core, released: () => releases };
}
describe("Avatar Cubism Core 边界", () => {
  test("标准参数映射、每次恢复默认值、上下坐标和 UV 转换", () => {
    const f = fixture(); const backend = createCubismAvatar({ core: f.core, moc: new ArrayBuffer(8), textures: ["texture.png"] });
    expect(backend.supportedParameters).toEqual(["HeadYaw", "EyeOpenL"]);
    expect(backend.unsupportedParameters).toContain("ArmR");
    const items = backend.sample({ HeadYaw: .5, EyeOpenL: 0 });
    expect(Array.from(f.model.parameters.values)).toEqual([15, 0]);
    expect(Array.from(items[0]!.vertices)).toEqual([0, 0, 100, 0, 100, 100]);
    expect(Array.from(items[0]!.uvs)).toEqual([0, 0, 1, 0, 1, 1]);
    backend.sample({ HeadYaw: -5 }); expect(Array.from(f.model.parameters.values)).toEqual([-30, 1]);
    backend.dispose(); backend.dispose(); expect(f.released()).toBe(2);
    expect(() => backend.sample({})).toThrow("已释放");
  });
  test("严格参数检查失败时释放模型和 MOC", () => {
    const f = fixture();
    expect(() => createCubismAvatar({ core: f.core, moc: new ArrayBuffer(8), textures: ["texture.png"], strictParameters: true })).toThrow("缺少参数");
    expect(f.released()).toBe(2);
  });
  test("Cubism 5.3 的 getRenderOrders 和 blendModes 能正确映射", () => {
    const f = fixture();
    const { renderOrders: _, ...drawables } = f.model.drawables;
    const model = { ...f.model, getRenderOrders: () => new Int32Array([4]),
      drawables: { ...drawables, blendModes: new Int32Array([0]), multiplyColors: new Float32Array([.5, 1, 1, 1]) } };
    const core = { ...f.core, ColorBlendType_Normal: 0, ColorBlendType_AddCompatible: 16, ColorBlendType_MultiplyCompatible: 17, Model: { fromMoc: () => model } };
    const backend = createCubismAvatar({ core, moc: new ArrayBuffer(8), textures: ["texture.png"] });
    expect(backend.sample({})[0]).toMatchObject({ order: 4, blend: "normal", multiplyColor: [.5, 1, 1] });
    backend.dispose();
  });
  test("不支持的离屏组合明确失败并释放资源", () => {
    const f = fixture(); const core = { ...f.core, Model: { fromMoc: () => ({ ...f.model, offscreens: { count: 1 } }) } };
    expect(() => createCubismAvatar({ core, moc: new ArrayBuffer(8), textures: ["texture.png"] })).toThrow("离屏组合");
    expect(f.released()).toBe(2);
  });
  test("无嘴模型可以显式禁用口型映射", () => {
    const f = fixture(); const b = createCubismAvatar({ core: f.core, moc: new ArrayBuffer(8), textures: ["texture.png"], parameterMap: { MouthOpen: null, MouthForm: null } });
    expect(b.unsupportedParameters).not.toContain("MouthOpen"); b.dispose();
  });
  test("model3 引用与 MOC3 magic 有明确验证", () => {
    expect(cubismModelReferences({ Version: 3, FileReferences: { Moc: "voidavatar.moc3", Textures: ["textures/0.png"] } })).toEqual({ moc: "voidavatar.moc3", textures: ["textures/0.png"] });
    expect(() => cubismModelReferences({ Version: 2 })).toThrow("Version 3");
    expect(() => decodeAvatarMoc(btoa("wrong"))).toThrow("MOC3");
  });
  test("官方 Core 完整性检查拒绝损坏 MOC 后不会继续构造模型", () => {
    const f = fixture(); let constructed = false;
    const core = { ...f.core, Moc: { hasMocConsistency: () => false, fromArrayBuffer() { constructed = true; return null; } } };
    expect(() => createCubismAvatar({ core, moc: new ArrayBuffer(8), textures: ["texture.png"] })).toThrow("完整性检查");
    expect(constructed).toBe(false);
    expect(f.released()).toBe(0);
  });
});
