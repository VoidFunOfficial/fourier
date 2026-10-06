import { describe, expect, test } from "bun:test";
import { AVATAR_PARAMETERS, avatarMotion, compileAvatarTimeline, createAvatarMeshRig, createLayerAvatar, defineAvatar, defineAvatarSpeech, mixAvatarParameters, pcmToSpeech, phonemesToSpeech, sampleAvatarCurve, sampleAvatarSpeech } from "../src/avatar.ts";
import type { AvatarBackend, AvatarDrawable, AvatarModel } from "../src/avatar.ts";

const base: AvatarModel = { version: 1, name: "test", canvas: [100, 100], layers: [], physics: [{ input: "HeadYaw", output: "HairFront", stiffness: 45, damping: 7 }] };
describe("Avatar 模型和绝对时间轴", () => {
  test("标准参数完整且模型从输入深拷贝", () => {
    expect(Object.keys(AVATAR_PARAMETERS)).toContain("HandR");
    const input = { ...base, layers: [{ id: "root", position: [10, 20] }] };
    const model = defineAvatar(input); input.layers[0]!.position[0] = 90;
    expect(model.layers[0]!.position![0]).toBe(10); expect(Object.isFrozen(model.layers)).toBe(true);
  });
  test("拒绝循环、未知绑定、无效网格及错误资源引用", () => {
    expect(() => defineAvatar({ ...base, layers: [{ id: "a", parent: "b" }, { id: "b", parent: "a" }] })).toThrow("有环");
    expect(() => defineAvatar({ ...base, layers: [{ id: "a", bindings: [{ parameter: "Bad", property: "x", keys: [{ t: 0, value: 0 }] }] }] })).toThrow("未知参数");
    expect(() => defineAvatar({ ...base, layers: [{ id: "a", masks: ["missing"] }] })).toThrow("mask");
    expect(() => defineAvatar({ ...base, layers: [{ id: "a", mesh: { vertices: [0, 0, 1, 0, 1, 1], uvs: [0, 0, 1, 0, 1, 1], indices: [0, 1, 3] } }] })).toThrow("索引");
    expect(() => defineAvatar({ ...base, parameters: { Extra: [0, 1, 2] } })).toThrow("范围");
  });
  test("平滑、线性、阶梯曲线及混合优先级", () => {
    expect(sampleAvatarCurve([{ t: 0, value: 0 }, { t: 2, value: 1 }], 1)).toBe(.5);
    expect(sampleAvatarCurve([{ t: 0, value: 0, easing: "step" }, { t: 2, value: 1 }], 1.9)).toBe(0);
    expect(mixAvatarParameters({ HeadYaw: .2 }, [{ parameters: { HeadYaw: .2 }, blend: "add" }, { parameters: { HeadYaw: 2 }, blend: "multiply" }]).HeadYaw).toBe(.8);
    expect(() => sampleAvatarCurve([], 0)).toThrow("不能为空");
    expect(() => mixAvatarParameters({}, [{ parameters: { HeadYaw: 1 }, weight: NaN }])).toThrow("有限");
  });
  test("物理在 24/60fps 和倒序 seek 下返回同一状态，输出被限制", () => {
    const config = { duration: 6, seed: 91, actions: [{ at: .2, action: "shakeHead" as const, duration: 3 }] };
    const a = compileAvatarTimeline(base, config), b = compileAvatarTimeline(base, config);
    const expected = a.sample(1.75);
    for (let i = 0; i < 144; i++) a.sample(i / 24);
    for (let i = 359; i >= 0; i--) b.sample(i / 60);
    expect(a.sample(1.75)).toEqual(expected); expect(b.sample(1.75)).toEqual(expected);
    expect(a.sample(6).HairFront).not.toBe(0);
    expect(a.sample(-1)).toEqual(a.sample(0)); expect(a.sample(10)).toEqual(a.sample(6));
    expect(() => a.sample(NaN)).toThrow("有限");
  });
  test("语义动作可复用、目标坐标解析、终点回到基础状态", () => {
    for (const name of ["nod", "shakeHead", "wave", "thinking", "point", "explain", "emphasize"] as const) expect(avatarMotion(name).tracks.length).toBeGreaterThan(0);
    const t = compileAvatarTimeline(base, { duration: 3, idle: false, targets: { equation: [-.8, .2] }, actions: [{ at: 0, action: "point", target: "equation", duration: 2 }] });
    expect(t.sample(1).EyeX).toBe(-.8); expect(t.sample(1).ArmR).toBeGreaterThan(.8); expect(t.sample(2).ArmR).toBe(0);
    expect(() => compileAvatarTimeline(base, { duration: 3, lookAt: "missing" })).toThrow("目标");
  });
  test("重叠表情按 priority 决定，口型优先于表情", () => {
    const speech = defineAvatarSpeech({ version: 1, audioHash: "test", duration: 2, cues: [{ start: .5, end: 1, viseme: "M" }] });
    const t = compileAvatarTimeline(base, { duration: 3, idle: false, speak: speech, actions: [{ at: 0, action: "emotion", name: "happy", priority: 2, duration: 2 }, { at: 0, action: "emotion", name: "angry", priority: 1, duration: 2 }] });
    expect(t.sample(.75).MouthOpen).toBe(0); expect(t.sample(.75).BrowL).toBeCloseTo(.2);
  });
  test("离线音素和 PCM 支持静音与缓存序列化", () => {
    const speech = phonemesToSpeech({ audioHash: "hash", duration: 1, phonemes: [{ start: .1, end: .4, phoneme: "AA1" }, { start: .5, end: .8, phoneme: "M" }] });
    expect(sampleAvatarSpeech(speech, .25).MouthOpen).toBe(.9); expect(sampleAvatarSpeech(speech, .6).MouthOpen).toBe(0);
    expect(sampleAvatarSpeech(speech, .45).MouthOpen).toBe(0); expect(sampleAvatarSpeech(speech, 1).MouthOpen).toBe(0);
    expect(() => sampleAvatarSpeech(speech, NaN)).toThrow("有限");
    expect(defineAvatarSpeech(JSON.parse(JSON.stringify(speech)))).toEqual(speech);
    expect(pcmToSpeech(new Float32Array(480), 24000, "silence").cues[0]?.viseme).toBe("sil");
    expect(() => defineAvatarSpeech({ ...speech, cues: [{ start: .2, end: .8, viseme: "A" }, { start: .4, end: .9, viseme: "I" }] })).toThrow("无重叠");
  });
  test("层级变换与 BlendShape 按参数共同变形", () => {
    const backend = createLayerAvatar({ ...base, layers: [{ id: "parent", position: [10, 20] }, { id: "mesh", parent: "parent", texture: "test.png", mesh: {
      vertices: [0, 0, 10, 0, 10, 10], uvs: [0, 0, 1, 0, 1, 1], indices: [0, 1, 2], blendShapes: { HeadYaw: [2, 0, 0, 0, 0, 4] },
    } }] });
    expect(Array.from(backend.sample({ HeadYaw: .5 })[0]!.vertices)).toEqual([11, 20, 20, 20, 20, 32]);
    expect(Array.from(backend.sample({ HeadYaw: 10 })[0]!.vertices)).toEqual([12, 20, 20, 20, 20, 34]);
  });
  test("已有网格 rig 保留原始几何、UV、遮罩和混合，父级枢轴支持乱序动作", () => {
    const source: AvatarDrawable = { id: "eye", texture: "atlas.png", vertices: new Float32Array([10, 20, 20, 20, 10, 30]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]), indices: new Uint16Array([0, 1, 2]), opacity: .8, order: 4,
      masks: ["face"], invertedMask: true, blend: "multiply", multiplyColor: [.9, 1, 1] };
    let disposed = 0;
    const backend: AvatarBackend = { canvas: [100, 100], textures: [source.texture], sample: () => [source], dispose: () => { disposed++; } };
    const rig = createAvatarMeshRig(backend, { ...base, layers: [
      { id: "head", position: [10, 20], anchor: [10, 20], bindings: [{ parameter: "HeadRoll", property: "rotation", keys: [{ t: 0, value: 0 }, { t: 1, value: 90 }] }] },
      { id: "eye", parent: "head", position: [10, 20], anchor: [10, 20], bindings: [{ parameter: "EyeOpenL", property: "opacity", blend: "replace", keys: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }] },
    ] });
    expect(rig.sample({})[0]).toEqual(source);
    const rotated = rig.sample({ HeadRoll: 1 })[0]!;
    expect(Array.from(rotated.vertices)).toEqual([10, 20, 10, 30, 0, 20]);
    expect(rotated.uvs).toBe(source.uvs); expect(rotated.indices).toBe(source.indices);
    expect(rotated.masks).toEqual(source.masks); expect(rotated.blend).toBe("multiply");
    expect(rig.sample({ EyeOpenL: 0 })[0]!.opacity).toBe(0);
    expect(rig.sample({})[0]).toEqual(source);
    expect(Array.from(source.vertices)).toEqual([10, 20, 20, 20, 10, 30]);
    rig.dispose(); rig.dispose(); expect(disposed).toBe(1);
    expect(() => rig.sample({})).toThrow("已释放");
  });
  test("mesh rig 拒绝画布不匹配、重复纹理定义和拼错的网格 ID", () => {
    const backend = createLayerAvatar(base);
    expect(() => createAvatarMeshRig(backend, { ...base, canvas: [200, 100] })).toThrow("canvas");
    expect(() => createAvatarMeshRig(backend, { ...base, layers: [{ id: "a", texture: "atlas.png", size: [10, 10] }] })).toThrow("变换节点");
    const rig = createAvatarMeshRig(backend, { ...base, layers: [{ id: "missing" }] });
    expect(() => rig.sample({})).toThrow("未找到网格 missing");
    rig.dispose();
  });
});
