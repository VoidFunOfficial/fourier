import type { AvatarBackend, AvatarDrawable, AvatarParameters } from "@fourier-video/sdk/avatar";
import { paintedAtlasSize, paintedEyeRegions, paintedBrowRegions, type SpriteRegion } from "./painted-eye-regions.ts";

interface Point { readonly x: number; readonly y: number }
interface EyeReference { readonly drawable: AvatarDrawable; readonly center: Point; readonly eyeCenter: Point; readonly xx: number; readonly xy: number; readonly yy: number; readonly determinant: number; readonly scale: number }
const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
function value(parameters: AvatarParameters, key: string, fallback: number, lo: number, hi: number): number {
  const n = parameters[key] ?? fallback;
  if (!Number.isFinite(n)) throw new Error(`voidavatar painted eyes: ${key} must be finite`);
  return clamp(n, lo, hi);
}
function center(vertices: Float32Array): Point {
  let x = 0, y = 0; const count = vertices.length / 2;
  for (let i = 0; i < vertices.length; i += 2) { x += vertices[i]! / count; y += vertices[i + 1]! / count; }
  return { x, y };
}
function reference(drawable: AvatarDrawable, side: number): EyeReference {
  const c = center(drawable.vertices);
  let xx = 0, xy = 0, yy = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < drawable.vertices.length; i += 2) {
    const x = drawable.vertices[i]!, y = drawable.vertices[i + 1]!;
    const dx = x - c.x, dy = y - c.y; xx += dx * dx; xy += dx * dy; yy += dy * dy;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const region = paintedEyeRegions[0]![side]!;
  return { drawable, center: c, eyeCenter: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, xx, xy, yy,
    determinant: xx * yy - xy * xy, scale: (maxY - minY) * .82 / (region[3] - region[1]) };
}
/** Fit the original eye's current native pose; no original dot-eye deformation is reused as expression artwork. */
function nativeTransform(rest: EyeReference, current: AvatarDrawable): (x: number, y: number) => Point {
  if (current.vertices.length !== rest.drawable.vertices.length || Math.abs(rest.determinant) < 1e-7)
    throw new Error("voidavatar painted eyes: invalid native eye reference");
  const target = center(current.vertices);
  let xu = 0, xv = 0, yu = 0, yv = 0;
  for (let i = 0; i < current.vertices.length; i += 2) {
    const u = rest.drawable.vertices[i]! - rest.center.x, v = rest.drawable.vertices[i + 1]! - rest.center.y;
    const x = current.vertices[i]! - target.x, y = current.vertices[i + 1]! - target.y;
    xu += x * u; xv += x * v; yu += y * u; yv += y * v;
  }
  const a = (xu * rest.yy - xv * rest.xy) / rest.determinant;
  const b = (xv * rest.xx - xu * rest.xy) / rest.determinant;
  const c = (yu * rest.yy - yv * rest.xy) / rest.determinant;
  const d = (yv * rest.xx - yu * rest.xy) / rest.determinant;
  return (x, y) => ({ x: target.x + a * (x - rest.center.x) + b * (y - rest.center.y), y: target.y + c * (x - rest.center.x) + d * (y - rest.center.y) });
}
function sprite(base: AvatarDrawable, id: string, texture: string, region: SpriteRegion, anchor: Point, scale: number,
  transform: (x: number, y: number) => Point, opacity: number, order: number, angle = 0): AvatarDrawable {
  // A UV subrectangle samples the unedited generated atlas. Four pixels retain its soft alpha edge.
  const pad = 4, x0 = region[0] - pad, y0 = region[1] - pad, x1 = region[2] + pad, y1 = region[3] + pad;
  const halfW = (x1 - x0) * scale / 2, halfH = (y1 - y0) * scale / 2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const vertices = new Float32Array(8);
  [[-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH]].forEach(([x, y], i) => {
    const p = transform(anchor.x + x! * cos - y! * sin, anchor.y + x! * sin + y! * cos);
    vertices[i * 2] = p.x; vertices[i * 2 + 1] = p.y;
  });
  return { ...base, id, texture, vertices, indices, uvs: new Float32Array([x0 / paintedAtlasSize, y0 / paintedAtlasSize, x1 / paintedAtlasSize, y0 / paintedAtlasSize, x1 / paintedAtlasSize, y1 / paintedAtlasSize, x0 / paintedAtlasSize, y1 / paintedAtlasSize]), opacity, order };
}
/** Image-generated eye artwork and separately rendered eyebrows. Owns upstream disposal. */
export function createVoidavatarPaintedEyeBackend(backend: AvatarBackend, eyes: string, brows: string): AvatarBackend {
  const neutral = backend.sample({}), refs = ["L", "R"].map((side, index) => {
    const drawable = neutral.find(d => d.id === `Eye${side}`);
    if (!drawable) throw new Error(`voidavatar painted eyes: Eye${side} missing`);
    return reference({ ...drawable, vertices: new Float32Array(drawable.vertices) }, index);
  });
  let disposed = false;
  return {
    canvas: backend.canvas, textures: [...backend.textures, eyes, brows],
    sample(parameters) {
      if (disposed) throw new Error("voidavatar painted eyes: backend disposed");
      const art = Math.round(value(parameters, "EyeArt", 0, 0, 15));
      const browArt = Math.round(value(parameters, "BrowArt", art, 0, 15));
      const drawables = backend.sample(parameters), map = new Map(drawables.map(d => [d.id, d]));
      const result = drawables.filter(d => !["EyeL", "EyeR", "EyeClosedL", "EyeClosedR"].includes(d.id));
      for (const [sideIndex, side] of (["L", "R"] as const).entries()) {
        const current = map.get(`Eye${side}`)!, rest = refs[sideIndex]!, transform = nativeTransform(rest, current);
        const open = art === 1 || (art === 5 && sideIndex === 0) ? 1 : value(parameters, `EyeOpen${side}`, 1, 0, 1);
        // Three original paintings crossfade; eyebrow geometry/opacity does not read eye openness.
        const openWeight = clamp((open - .5) * 2, 0, 1), closedWeight = clamp(1 - open * 2, 0, 1);
        const halfWeight = 1 - openWeight - closedWeight;
        const closed = map.get(`EyeClosed${side}`)!;
        const region = paintedEyeRegions[art]![sideIndex]!;
        result.push(sprite(current, `Eye${side}`, eyes, region, rest.eyeCenter, rest.scale, transform, current.opacity * openWeight, current.order));
        result.push(sprite(current, `EyeHalf${side}`, eyes, paintedEyeRegions[13]![sideIndex]!, rest.eyeCenter, rest.scale, transform, current.opacity * halfWeight, current.order + .05));
        result.push(sprite(closed, `EyeClosed${side}`, eyes, paintedEyeRegions[14]![sideIndex]!, rest.eyeCenter, rest.scale, transform, current.opacity * closedWeight, current.order + .1));
        const browLift = value(parameters, `Brow${side}`, 0, -1, 1), browTilt = value(parameters, `BrowAngle${side}`, 0, -1, 1);
        const browAnchor = { x: rest.eyeCenter.x, y: rest.eyeCenter.y - 70 - browLift * 24 };
        result.push(sprite(current, `Brow${side}`, brows, paintedBrowRegions[browArt]![sideIndex]!, browAnchor, rest.scale * .65, transform, current.opacity, current.order + .2, browTilt * .36));
      }
      return result.sort((a, b) => a.order - b.order);
    },
    dispose() { if (!disposed) { disposed = true; backend.dispose(); } },
  };
}
