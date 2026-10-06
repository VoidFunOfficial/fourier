import { avatarFail, defineAvatar, finite, parameterRanges } from "./model.ts";
import { sampleAvatarCurve } from "./timeline.ts";
import type { AvatarBackend, AvatarDrawable, AvatarLayer, AvatarModel, AvatarParameters } from "./types.ts";

type Matrix = readonly [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];
function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
interface Pose { matrix: Matrix; opacity: number; order: number }
function layerPose(layer: AvatarLayer, params: AvatarParameters, parent: Pose): Pose {
  const p = { x: layer.position?.[0] ?? 0, y: layer.position?.[1] ?? 0, rotation: layer.rotation ?? 0,
    scaleX: layer.scale?.[0] ?? 1, scaleY: layer.scale?.[1] ?? 1, opacity: layer.opacity ?? 1, zIndex: layer.zIndex ?? 0 };
  for (const binding of layer.bindings ?? []) {
    const value = sampleAvatarCurve(binding.keys, params[binding.parameter] ?? 0);
    const mode = binding.blend ?? "add";
    p[binding.property] = mode === "replace" ? value : mode === "multiply" ? p[binding.property] * value : p[binding.property] + value;
  }
  const angle = p.rotation * Math.PI / 180; const c = Math.cos(angle), s = Math.sin(angle);
  const a = c * p.scaleX, b = s * p.scaleX, d = c * p.scaleY, e = -s * p.scaleY;
  const x = layer.anchor?.[0] ?? 0, y = layer.anchor?.[1] ?? 0;
  return { matrix: multiply(parent.matrix, [a, b, e, d, p.x - a * x - e * y, p.y - b * x - d * y]),
    opacity: parent.opacity * Math.min(1, Math.max(0, p.opacity)), order: p.zIndex + parent.order };
}
function poseSampler(model: AvatarModel) {
  const byId = new Map(model.layers.map(l => [l.id, l]));
  const ranges = parameterRanges(model);
  return (input: AvatarParameters) => {
    const params = Object.fromEntries(Object.entries(ranges).map(([key, range]) =>
      [key, Math.min(range[1], Math.max(range[0], finite(input[key] ?? range[2], key)))]));
    const poses = new Map<string, Pose>();
    const poseFor = (layer: AvatarLayer): Pose => {
      const found = poses.get(layer.id); if (found) return found;
      const pose = layerPose(layer, params, layer.parent ? poseFor(byId.get(layer.parent)!) : { matrix: identity, opacity: 1, order: 0 });
      poses.set(layer.id, pose); return pose;
    };
    return { params, poseFor };
  };
}
function transformVertices(source: Float32Array, m: Matrix): Float32Array {
  const vertices = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 2) {
    const x = source[i]!, y = source[i + 1]!;
    vertices[i] = m[0] * x + m[2] * y + m[4]; vertices[i + 1] = m[1] * x + m[3] * y + m[5];
  }
  return vertices;
}
/** Overlay transforms on existing mesh IDs. Positions/anchors use backend canvas pixels.
 * Set position equal to anchor for a neutral pivot. The wrapper owns backend disposal.
 */
export function createAvatarMeshRig(backend: AvatarBackend, input: AvatarModel): AvatarBackend {
  const model = defineAvatar(input);
  if (model.canvas.some((n, i) => n !== backend.canvas[i])) avatarFail("mesh rig canvas 必须与 backend 一致");
  for (const layer of model.layers) {
    if (layer.texture || layer.mesh || layer.size || layer.masks || layer.invertedMask !== undefined || layer.maskOnly !== undefined)
      avatarFail("mesh rig 只接受变换节点，纹理、网格与遮罩由 backend 提供");
  }
  const byId = new Map(model.layers.map(l => [l.id, l]));
  const parents = new Set(model.layers.flatMap(l => l.parent ? [l.parent] : []));
  const samplePose = poseSampler(model); let disposed = false;
  return {
    canvas: backend.canvas, textures: backend.textures,
    sample(inputParams) {
      if (disposed) avatarFail("mesh rig 已释放");
      const { params, poseFor } = samplePose(inputParams);
      const drawables = backend.sample(params); const ids = new Set(drawables.map(d => d.id));
      for (const layer of model.layers) if (!parents.has(layer.id) && !ids.has(layer.id)) avatarFail(`mesh rig 未找到网格 ${layer.id}`);
      return drawables.map(drawable => {
        const layer = byId.get(drawable.id); if (!layer) return drawable;
        const pose = poseFor(layer);
        return { ...drawable, vertices: transformVertices(drawable.vertices, pose.matrix),
          opacity: drawable.opacity * pose.opacity, order: drawable.order + pose.order };
      }).sort((a, b) => a.order - b.order);
    },
    dispose() { if (!disposed) { disposed = true; backend.dispose(); } },
  };
}
export function createLayerAvatar(input: AvatarModel): AvatarBackend {
  const model = defineAvatar(input); const samplePose = poseSampler(model);
  return {
    canvas: model.canvas,
    textures: [...new Set(model.layers.flatMap(l => l.texture ? [l.texture] : []))],
    sample(inputParams) {
      const { params, poseFor } = samplePose(inputParams);
      const drawables: AvatarDrawable[] = [];
      for (const layer of model.layers) {
        if (!layer.texture) continue;
        const { matrix: m, opacity, order } = poseFor(layer);
        const [w, h] = layer.size ?? [1, 1];
        const vertices = new Float32Array(layer.mesh?.vertices ?? [0, 0, w, 0, w, h, 0, h]);
        for (const [parameter, deltas] of Object.entries(layer.mesh?.blendShapes ?? {})) {
          const weight = params[parameter] ?? 0;
          for (let i = 0; i < vertices.length; i++) vertices[i] = vertices[i]! + deltas[i]! * weight;
        }
        drawables.push({ id: layer.id, texture: layer.texture, vertices: transformVertices(vertices, m),
          uvs: new Float32Array(layer.mesh?.uvs ?? [0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint16Array(layer.mesh?.indices ?? [0, 1, 2, 0, 2, 3]),
          opacity, order, masks: layer.masks ?? [], ...(layer.invertedMask !== undefined ? { invertedMask: layer.invertedMask } : {}),
          ...(layer.maskOnly !== undefined ? { maskOnly: layer.maskOnly } : {}) });
      }
      return drawables.sort((a, b) => a.order - b.order);
    },
    dispose() {},
  };
}
