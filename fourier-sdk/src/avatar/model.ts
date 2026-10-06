import { SdkError } from "../errors.ts";
import type { AvatarCurve, AvatarModel, AvatarRange } from "./types.ts";

export function avatarFail(message: string, code = "INVALID_AVATAR"): never {
  throw new SdkError(code, message);
}
export function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) avatarFail(`${name} 必须是有限数字`);
  return value;
}
export function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) avatarFail(`${name} 必须是对象`);
  return value as Record<string, unknown>;
}
export function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) avatarFail(`${name} 必须是数组`);
  return value;
}
export function textValue(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) avatarFail(`${name} 必须是非空字符串`);
  return value;
}
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) freeze(entry);
    Object.freeze(value);
  }
  return value;
}
export const AVATAR_PARAMETERS: Readonly<Record<string, AvatarRange>> = freeze({
  HeadYaw: [-1, 1, 0], HeadPitch: [-1, 1, 0], HeadRoll: [-1, 1, 0],
  BodyYaw: [-1, 1, 0], BodyPitch: [-1, 1, 0],
  EyeX: [-1, 1, 0], EyeY: [-1, 1, 0], EyeOpenL: [0, 1, 1], EyeOpenR: [0, 1, 1],
  BrowL: [-1, 1, 0], BrowR: [-1, 1, 0], MouthOpen: [0, 1, 0], MouthForm: [-1, 1, 0],
  Smile: [0, 1, 0], Breath: [0, 1, 0], ArmL: [-1, 1, 0], ArmR: [-1, 1, 0], HandL: [-1, 1, 0], HandR: [-1, 1, 0],
  HairFront: [-1, 1, 0], HairBack: [-1, 1, 0], Ribbon: [-1, 1, 0], Clothes: [-1, 1, 0],
});
export function parameterRanges(model: AvatarModel): Readonly<Record<string, AvatarRange>> {
  return { ...AVATAR_PARAMETERS, ...model.parameters };
}
export function validateCurve(value: unknown, name: string, allowNegative = false): asserts value is AvatarCurve {
  const keys = array(value, name);
  if (!keys.length) avatarFail(`${name} 不能为空`);
  let previous = -Infinity;
  for (const item of keys) {
    const key = record(item, name);
    const t = finite(key.t, `${name}.t`);
    finite(key.value, `${name}.value`);
    if ((!allowNegative && t < 0) || t <= previous) avatarFail(`${name} 必须严格按时间递增`);
    if (key.easing !== undefined && !["linear", "smooth", "step"].includes(String(key.easing))) avatarFail(`${name}.easing 无效`);
    previous = t;
  }
}
function blend(value: unknown): void {
  if (value !== undefined && !["replace", "add", "multiply"].includes(String(value))) avatarFail("blend 无效");
}
function point(value: unknown, name: string): void {
  if (array(value, name).length !== 2) avatarFail(`${name} 必须是二元坐标`);
  for (const n of value as unknown[]) finite(n, name);
}
/** Parses JSON at the trust boundary and returns a detached, deeply immutable model. */
export function defineAvatar(value: unknown): Readonly<AvatarModel> {
  const data = record(value, "avatar");
  if (data.version !== 1) avatarFail("Avatar 只支持 version: 1");
  textValue(data.name, "name"); point(data.canvas, "canvas");
  if ((data.canvas as number[]).some(n => n <= 0 || n > 16384)) avatarFail("canvas 超出范围");
  const ranges = { ...AVATAR_PARAMETERS };
  if (data.parameters !== undefined) for (const [name, range] of Object.entries(record(data.parameters, "parameters"))) {
    const r = array(range, name).map(n => finite(n, name));
    if (r.length !== 3 || r[0]! >= r[1]! || r[2]! < r[0]! || r[2]! > r[1]!) avatarFail(`${name} 范围无效`);
    ranges[name] = [r[0]!, r[1]!, r[2]!];
  }
  const parameter = (name: unknown) => {
    const id = textValue(name, "parameter");
    if (!Object.hasOwn(ranges, id)) avatarFail(`未知参数 ${id}`);
  };
  const layers = array(data.layers, "layers");
  const ids = new Set<string>();
  const parents = new Map<string, string>();
  for (const entry of layers) {
    const layer = record(entry, "layer"); const id = textValue(layer.id, "layer.id");
    if (ids.has(id)) avatarFail(`重复图层 ${id}`); ids.add(id);
    if (layer.parent !== undefined) parents.set(id, textValue(layer.parent, `${id}.parent`));
    for (const key of ["size", "position", "anchor", "scale"]) if (layer[key] !== undefined) point(layer[key], `${id}.${key}`);
    for (const key of ["rotation", "opacity", "zIndex"]) if (layer[key] !== undefined) finite(layer[key], `${id}.${key}`);
    for (const key of ["maskOnly", "invertedMask"]) if (layer[key] !== undefined && typeof layer[key] !== "boolean") avatarFail(`${id}.${key} 必须是布尔值`);
    if (layer.texture !== undefined) {
      textValue(layer.texture, `${id}.texture`);
      if (layer.mesh === undefined && layer.size === undefined) avatarFail(`${id} 需要 size 或 mesh`);
    }
    if (layer.size !== undefined && (layer.size as number[]).some(n => n <= 0)) avatarFail(`${id}.size 必须为正`);
    if (layer.bindings !== undefined) for (const raw of array(layer.bindings, "bindings")) {
      const binding = record(raw, "binding"); parameter(binding.parameter);
      if (!["x", "y", "rotation", "scaleX", "scaleY", "opacity", "zIndex"].includes(String(binding.property))) avatarFail("binding.property 无效");
      validateCurve(binding.keys, "binding.keys", true); blend(binding.blend);
    }
    if (layer.mesh !== undefined) {
      const mesh = record(layer.mesh, "mesh");
      const vertices = array(mesh.vertices, "vertices"); const uvs = array(mesh.uvs, "uvs"); const indices = array(mesh.indices, "indices");
      if (vertices.length < 6 || vertices.length % 2 || vertices.length > 131070 || uvs.length !== vertices.length || !indices.length || indices.length % 3) avatarFail("mesh 维度无效");
      [...vertices, ...uvs].forEach(n => finite(n, "mesh"));
      for (const index of indices) if (!Number.isInteger(index) || Number(index) < 0 || Number(index) >= vertices.length / 2) avatarFail("mesh 索引越界");
      if (mesh.blendShapes !== undefined) for (const [key, deltas] of Object.entries(record(mesh.blendShapes, "blendShapes"))) {
        parameter(key);
        if (array(deltas, key).length !== vertices.length) avatarFail(`${key} blendShape 长度不符`);
        (deltas as unknown[]).forEach(n => finite(n, key));
      }
    }
  }
  for (const [id, parent] of parents) {
    if (!ids.has(parent)) avatarFail(`${id} 的父节点不存在`);
    const visited = new Set([id]); let current: string | undefined = parent;
    while (current !== undefined) { if (visited.has(current)) avatarFail("deformer 图有环"); visited.add(current); current = parents.get(current); }
  }
  for (const entry of layers) {
    const layer = record(entry, "layer");
    if (layer.masks !== undefined) for (const mask of array(layer.masks, "masks")) {
      if (!ids.has(String(mask)) || mask === layer.id) avatarFail("mask 引用无效");
      if (!layers.some(raw => record(raw, "layer").id === mask && record(raw, "layer").texture !== undefined)) avatarFail("mask 需要纹理图层");
    }
  }
  if (data.motions !== undefined) for (const [name, raw] of Object.entries(record(data.motions, "motions"))) {
    const motion = record(raw, name); const duration = finite(motion.duration, `${name}.duration`);
    if (duration <= 0) avatarFail("motion.duration 必须大于零");
    if (motion.loop !== undefined && typeof motion.loop !== "boolean") avatarFail("motion.loop 必须是布尔值");
    for (const rawTrack of array(motion.tracks, "tracks")) {
      const track = record(rawTrack, "track"); parameter(track.parameter); blend(track.blend); validateCurve(track.keys, "track.keys");
      if (track.keys.at(-1)!.t > duration) avatarFail("motion 关键帧超过 duration");
    }
  }
  if (data.expressions !== undefined) for (const raw of Object.values(record(data.expressions, "expressions"))) {
    const expression = record(raw, "expression"); blend(expression.blend);
    for (const [key, number] of Object.entries(record(expression.parameters, "expression.parameters"))) { parameter(key); finite(number, key); }
  }
  const outputs = new Set<string>();
  if (data.physics !== undefined) for (const raw of array(data.physics, "physics")) {
    const spring = record(raw, "spring"); parameter(spring.input); parameter(spring.output);
    const output = String(spring.output);
    if (outputs.has(output) || spring.input === output) avatarFail("spring output 必须唯一且不同于 input"); outputs.add(output);
    for (const key of ["stiffness", "damping", "mass"]) {
      const number = finite(spring[key] ?? (key === "mass" ? 1 : undefined), key);
      if (number <= 0 || number > 1000) avatarFail(`spring.${key} 超出范围`);
    }
    if (spring.gain !== undefined) finite(spring.gain, "gain");
  }
  if (data.physics !== undefined && (data.physics as Record<string, unknown>[]).some(s => outputs.has(String(s.input)))) avatarFail("spring 输入必须来自动画参数，不能互相反馈");
  return freeze(structuredClone(data) as unknown as AvatarModel);
}
