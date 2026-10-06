import { avatarFail, finite, freeze, record, textValue } from "./model.ts";
import type { AvatarBackend, AvatarDrawable, AvatarParameters, AvatarPoint } from "./types.ts";

/** Structural boundary for the official, separately licensed Cubism Core for Web. */
export interface CubismCoreModel {
  readonly parameters: { readonly ids: readonly string[]; readonly values: Float32Array; readonly minimumValues: Float32Array; readonly maximumValues: Float32Array; readonly defaultValues: Float32Array };
  readonly parts: { readonly opacities: Float32Array };
  readonly canvasinfo: { readonly CanvasWidth: number; readonly CanvasHeight: number; readonly PixelsPerUnit: number; readonly CanvasOriginX: number; readonly CanvasOriginY: number };
  readonly drawables: {
    readonly ids: readonly string[];
    readonly textureIndices: Int32Array;
    readonly vertexPositions: readonly Float32Array[];
    readonly vertexUvs: readonly Float32Array[];
    readonly indices: readonly Uint16Array[];
    readonly opacities: Float32Array;
    readonly renderOrders?: Int32Array;
    readonly blendModes?: Int32Array;
    readonly multiplyColors?: Float32Array;
    readonly screenColors?: Float32Array;
    readonly masks: readonly Int32Array[];
    readonly constantFlags: Uint8Array;
    readonly dynamicFlags: Uint8Array;
    resetDynamicFlags(): void;
  };
  readonly offscreens?: { readonly count: number };
  getRenderOrders?(): Int32Array;
  update(): void;
  release(): void;
}
export interface CubismCore {
  readonly Moc: { hasMocConsistency?(data: ArrayBuffer): boolean; fromArrayBuffer(data: ArrayBuffer, checkConsistency?: boolean): { _release(): void } | null };
  readonly Model: { fromMoc(moc: { _release(): void }): CubismCoreModel | null };
  readonly ColorBlendType_Normal?: number;
  readonly ColorBlendType_AddCompatible?: number;
  readonly ColorBlendType_MultiplyCompatible?: number;
}
export interface CubismParameterBinding {
  readonly id: string;
  readonly scale?: number;
  readonly offset?: number;
}
export const CUBISM_PARAMETER_MAP: Readonly<Record<string, CubismParameterBinding>> = freeze({
  HeadYaw: { id: "ParamAngleX", scale: 30 }, HeadPitch: { id: "ParamAngleY", scale: 30 }, HeadRoll: { id: "ParamAngleZ", scale: 30 },
  BodyYaw: { id: "ParamBodyAngleX", scale: 10 }, BodyPitch: { id: "ParamBodyAngleY", scale: 10 },
  EyeX: { id: "ParamEyeBallX" }, EyeY: { id: "ParamEyeBallY", scale: -1 },
  EyeOpenL: { id: "ParamEyeLOpen" }, EyeOpenR: { id: "ParamEyeROpen" }, BrowL: { id: "ParamBrowLY" }, BrowR: { id: "ParamBrowRY" },
  MouthOpen: { id: "ParamMouthOpenY" }, MouthForm: { id: "ParamMouthForm" }, Smile: { id: "ParamCheek" }, Breath: { id: "ParamBreath" },
  ArmL: { id: "ParamArmLA" }, ArmR: { id: "ParamArmRA" }, HandL: { id: "ParamHandL" }, HandR: { id: "ParamHandR" },
  HairFront: { id: "ParamHairFront" }, HairBack: { id: "ParamHairBack" }, Ribbon: { id: "ParamHairSide" }, Clothes: { id: "ParamBodyAngleZ", scale: 10 },
});
export interface CubismAvatarOptions {
  readonly core: CubismCore;
  readonly moc: ArrayBuffer;
  /** Texture URLs in the order declared by model3.json FileReferences.Textures. */
  readonly textures: readonly string[];
  readonly parameterMap?: Readonly<Record<string, CubismParameterBinding | null>>;
  readonly strictParameters?: boolean;
}
export interface CubismAvatarBackend extends AvatarBackend {
  readonly supportedParameters: readonly string[];
  readonly unsupportedParameters: readonly string[];
}
/** Produced by a local .moc3 / .model3.json import in the Fourier compiler. */
export interface CubismAvatarSource {
  readonly kind: "cubism";
  readonly name: string;
  readonly mocBase64: string;
  readonly textures: readonly string[];
  readonly createCore: () => CubismCore | Promise<CubismCore>;
  readonly parameterMap?: Readonly<Record<string, CubismParameterBinding | null>>;
}
/** Owns the Core model and resets all input state before every absolute-time sample. */
export function createCubismAvatar(options: CubismAvatarOptions): CubismAvatarBackend {
  if (!options.core?.Moc || !options.core.Model) avatarFail("需要官方 Cubism Core for Web", "AVATAR_CUBISM_CORE_REQUIRED");
  const data = options.moc.slice(0);
  if (options.core.Moc.hasMocConsistency && !options.core.Moc.hasMocConsistency(data)) avatarFail("Cubism MOC3 完整性检查失败", "AVATAR_CUBISM_MOC_INVALID");
  const moc = options.core.Moc.fromArrayBuffer(data);
  if (!moc) avatarFail("Cubism MOC3 无效或 Core 版本不支持", "AVATAR_CUBISM_MOC_INVALID");
  let model: CubismCoreModel | null;
  try { model = options.core.Model.fromMoc(moc); } catch (error) { moc._release(); throw error; }
  if (!model) { moc._release(); avatarFail("Cubism 模型创建失败", "AVATAR_CUBISM_MOC_INVALID"); }
  try {
    const c = model.canvasinfo;
    if ((model.offscreens?.count ?? 0) > 0) avatarFail("当前 Avatar renderer 尚不支持 Cubism 离屏组合", "AVATAR_CUBISM_FEATURE_UNSUPPORTED");
    const blendModes = model.drawables.blendModes;
    const blends = model.drawables.ids.map((_, i): "normal" | "add" | "multiply" => {
      if (!blendModes) {
        const flags = model.drawables.constantFlags[i]!;
        return (flags & 1) !== 0 ? "add" : (flags & 2) !== 0 ? "multiply" : "normal";
      }
      const color = blendModes[i]! & 0xff; const alpha = (blendModes[i]! >> 8) & 0xff;
      if (color === options.core.ColorBlendType_AddCompatible) return "add";
      if (color === options.core.ColorBlendType_MultiplyCompatible) return "multiply";
      if (color === options.core.ColorBlendType_Normal && alpha === 0) return "normal";
      return avatarFail("当前 Avatar renderer 尚不支持该 Cubism 扩展混合模式", "AVATAR_CUBISM_FEATURE_UNSUPPORTED");
    });
    if (![c.CanvasWidth, c.CanvasHeight, c.PixelsPerUnit].every(n => Number.isFinite(n) && n > 0)) avatarFail("Cubism canvasinfo 无效");
    const mapping = { ...CUBISM_PARAMETER_MAP, ...options.parameterMap };
    const indices = new Map(model.parameters.ids.map((id, i) => [id, i]));
    const supported: string[] = [], unsupported: string[] = [];
    const bindings: { key: string; index: number; scale: number; offset: number }[] = [];
    for (const [key, binding] of Object.entries(mapping)) {
      if (binding === null) continue;
      const index = indices.get(binding.id);
      if (index === undefined) unsupported.push(key);
      else { supported.push(key); bindings.push({ key, index, scale: finite(binding.scale ?? 1, "Cubism scale"), offset: finite(binding.offset ?? 0, "Cubism offset") }); }
    }
    if (options.strictParameters && unsupported.length) avatarFail(`Cubism 缺少参数：${unsupported.join(", ")}`, "AVATAR_CUBISM_PARAMETER_MISSING");
    for (const index of model.drawables.textureIndices) if (index < 0 || index >= options.textures.length) avatarFail("Cubism 纹理索引越界");
    const defaultParts = new Float32Array(model.parts.opacities); let disposed = false;
    return {
      canvas: Object.freeze([c.CanvasWidth, c.CanvasHeight]) as AvatarPoint,
      textures: Object.freeze([...options.textures]), supportedParameters: Object.freeze(supported), unsupportedParameters: Object.freeze(unsupported),
      sample(parameters: AvatarParameters): readonly AvatarDrawable[] {
        if (disposed) avatarFail("Cubism backend 已释放");
        model.parameters.values.set(model.parameters.defaultValues); model.parts.opacities.set(defaultParts);
        for (const b of bindings) {
          const value = parameters[b.key]; if (value === undefined) continue;
          model.parameters.values[b.index] = Math.max(model.parameters.minimumValues[b.index]!, Math.min(model.parameters.maximumValues[b.index]!, finite(value, b.key) * b.scale + b.offset));
        }
        model.drawables.resetDynamicFlags(); model.update();
        const d = model.drawables;
        const orders = model.getRenderOrders?.() ?? d.renderOrders;
        if (!orders || orders.length < d.ids.length) avatarFail("Cubism Core 缺少绘制顺序");
        return d.ids.map((id, i): AvatarDrawable => {
          const positions = new Float32Array(d.vertexPositions[i]!);
          for (let j = 0; j < positions.length; j += 2) { positions[j] = positions[j]! * c.PixelsPerUnit + c.CanvasOriginX; positions[j + 1] = c.CanvasHeight - (positions[j + 1]! * c.PixelsPerUnit + c.CanvasOriginY); }
          const uvs = new Float32Array(d.vertexUvs[i]!); for (let j = 1; j < uvs.length; j += 2) uvs[j] = 1 - uvs[j]!;
          const flags = d.constantFlags[i]!;
          return { id, texture: options.textures[d.textureIndices[i]!]!, vertices: positions, uvs, indices: new Uint16Array(d.indices[i]!),
            opacity: d.opacities[i]!, order: orders[i]!, masks: Array.from(d.masks[i]!, index => d.ids[index]!),
            ...(d.multiplyColors ? { multiplyColor: [d.multiplyColors[i * 4]!, d.multiplyColors[i * 4 + 1]!, d.multiplyColors[i * 4 + 2]!] as const } : {}),
            ...(d.screenColors ? { screenColor: [d.screenColors[i * 4]!, d.screenColors[i * 4 + 1]!, d.screenColors[i * 4 + 2]!] as const } : {}),
            invertedMask: (flags & 8) !== 0, blend: blends[i]! };
        }).sort((a, b) => a.order - b.order);
      },
      dispose() { if (!disposed) { disposed = true; model.release(); moc._release(); } },
    };
  } catch (error) { model.release(); moc._release(); throw error; }
}
/** Parse resource references before an offline packer resolves them against disk. */
export function cubismModelReferences(value: unknown): Readonly<{ moc: string; textures: readonly string[] }> {
  const model = record(value, "model3"); if (model.Version !== 3) avatarFail("需要 Cubism model3.json Version 3");
  const refs = record(model.FileReferences, "FileReferences");
  const moc = textValue(refs.Moc, "Moc");
  if (!Array.isArray(refs.Textures) || !refs.Textures.length) avatarFail("model3.json 缺少纹理");
  return freeze({ moc, textures: refs.Textures.map(t => textValue(t, "Texture")) });
}
export function decodeAvatarMoc(base64: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  if (bytes.length < 4 || String.fromCharCode(...bytes.subarray(0, 4)) !== "MOC3") avatarFail("无效 MOC3 数据");
  return bytes.buffer;
}
