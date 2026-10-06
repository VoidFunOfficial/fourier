import type { AvatarBackend, AvatarDrawable, AvatarParameters } from "@fourier-video/sdk/avatar";

const hairIds = ["HairBack", "HairSideL", "HairSideR", "HairFront", "Ahoge2"] as const;
type HairId = typeof hairIds[number];
interface HairRest {
  readonly id: HairId;
  readonly vertices: Float32Array;
  readonly indices: Uint16Array;
  readonly centerX: number;
  readonly centerY: number;
  readonly inverse: readonly [number, number, number];
  readonly weights: Float32Array;
  readonly progress: Float32Array;
  readonly sides: Float32Array;
  readonly limit: number;
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function channel(parameters: AvatarParameters, name: string, min = -1): number {
  const value = parameters[name] ?? 0;
  if (!Number.isFinite(value)) throw new Error(`voidavatar hair: ${name} must be finite`);
  return clamp(value, min, 1);
}
function restMesh(drawable: AvatarDrawable, id: HairId, clipBottom: number): HairRest {
  const vertices = new Float32Array(drawable.vertices), count = vertices.length / 2;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, centerX = 0, centerY = 0;
  for (let i = 0; i < vertices.length; i += 2) {
    const x = vertices[i]!, y = vertices[i + 1]!;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    centerX += x / count; centerY += y / count;
  }
  let xx = 0, xy = 0, yy = 0;
  const weights = new Float32Array(count), progress = new Float32Array(count), sides = new Float32Array(count);
  // The broad upper fringe, including every triangle under the clip, stays rigid.
  const root = id === "HairFront" ? clipBottom + 42
    : id === "Ahoge2" ? maxY - (maxY - minY) * .22 : minY + (maxY - minY) * .22;
  for (let i = 0; i < count; i++) {
    const x = vertices[i * 2]! - centerX, y = vertices[i * 2 + 1]! - centerY;
    xx += x * x; xy += x * y; yy += y * y;
    const t = clamp(id === "Ahoge2" ? (root - vertices[i * 2 + 1]!) / (root - minY)
      : (vertices[i * 2 + 1]! - root) / (maxY - root), 0, 1);
    progress[i] = t; weights[i] = t * t * (3 - 2 * t);
    sides[i] = id === "HairSideL" ? -1 : id === "HairSideR" ? 1
      : clamp((vertices[i * 2]! - (minX + maxX) / 2) / ((maxX - minX) * .4), -1, 1);
  }
  const determinant = xx * yy - xy * xy;
  if (!Number.isFinite(determinant) || determinant <= 1e-6) throw new Error(`voidavatar hair: degenerate ${id}`);
  return { id, vertices, indices: new Uint16Array(drawable.indices), centerX, centerY,
    inverse: [yy / determinant, -xy / determinant, xx / determinant], weights, progress, sides,
    limit: id === "HairFront" ? 48 : id === "Ahoge2" ? 60 : id === "HairBack" ? 110 : 94 };
}
/** Least-squares linear part of the current native pose. Translation never enters a delta. */
function nativeBasis(rest: HairRest, current: Float32Array): readonly [number, number, number, number] {
  let xx = 0, xy = 0, yx = 0, yy = 0;
  for (let i = 0; i < current.length; i += 2) {
    const x = rest.vertices[i]! - rest.centerX, y = rest.vertices[i + 1]! - rest.centerY;
    xx += current[i]! * x; xy += current[i]! * y; yx += current[i + 1]! * x; yy += current[i + 1]! * y;
  }
  const [a, b, d] = rest.inverse;
  return [xx * a + xy * b, yx * a + yy * b, xx * b + xy * d, yx * b + yy * d];
}
function area(vertices: Float32Array, a: number, b: number, c: number): number {
  return (vertices[b]! - vertices[a]!) * (vertices[c + 1]! - vertices[a + 1]!)
    - (vertices[b + 1]! - vertices[a + 1]!) * (vertices[c]! - vertices[a]!);
}
function bend(rest: HairRest, drawable: AvatarDrawable, parameters: AvatarParameters): AvatarDrawable {
  if (drawable.vertices.length !== rest.vertices.length || drawable.indices.length !== rest.indices.length)
    throw new Error(`voidavatar hair: topology changed for ${rest.id}`);
  const sway = channel(parameters, "HairSway"), fan = channel(parameters, "HairFan", 0), curl = channel(parameters, "HairCurl");
  const follow = channel(parameters, rest.id === "HairBack" ? "HairBack" : rest.id.startsWith("HairSide") ? "HairSide" : "HairFront");
  if (sway === 0 && fan === 0 && curl === 0 && follow === 0) return drawable;
  const deltas = new Float32Array(rest.vertices.length);
  const fringe = rest.id === "HairFront", ahoge = rest.id === "Ahoge2";
  let greatest = 0;
  for (let i = 0; i < rest.weights.length; i++) {
    const w = rest.weights[i]!, t = rest.progress[i]!, side = rest.sides[i]!;
    // Signed sway, open fan, and inward/outward hooks give five distinct silhouettes.
    // A single gain bounds the whole field, so adjacent vertices cannot hit separate clamps.
    const x = w * ((fringe ? 46 : ahoge ? 66 : 106) * sway + (ahoge ? 46 : 34) * follow
      + (fringe ? 14 : ahoge ? 0 : 58) * fan * side
      + (fringe ? 20 : ahoge ? 40 : 52) * curl * (ahoge ? 1 : side) * (.5 - 1.5 * t));
    const y = w * ((fringe ? -12 : ahoge ? -18 : -36) * fan - (fringe ? 9 : 27) * curl * t);
    deltas[i * 2] = x; deltas[i * 2 + 1] = y; greatest = Math.max(greatest, Math.hypot(x, y));
  }
  const [a, b, c, d] = nativeBasis(rest, drawable.vertices);
  // Smooth saturation avoids a velocity corner as a stronger pose reaches the cap.
  const limit = Math.pow(1 + Math.pow(greatest / rest.limit, 4), -.25);
  for (let i = 0; i < deltas.length; i += 2) {
    const x = deltas[i]! * limit, y = deltas[i + 1]! * limit;
    deltas[i] = a * x + c * y; deltas[i + 1] = b * x + d * y;
  }
  // A triangle's signed area is quadratic in gain. Its first positive boundary
  // gives a continuous limit, unlike 1/.5/.25 backtracking which could pop on seek.
  // Keep 18% of the native area; this also leaves float32 rounding margin.
  let gain = 1;
  for (let i = 0; i < rest.indices.length; i += 3) {
    const ai = rest.indices[i]! * 2, bi = rest.indices[i + 1]! * 2, ci = rest.indices[i + 2]! * 2;
    const before = area(drawable.vertices, ai, bi, ci);
    if (Math.abs(before) <= 1e-5) continue;
    const ex = drawable.vertices[bi]! - drawable.vertices[ai]!, ey = drawable.vertices[bi + 1]! - drawable.vertices[ai + 1]!;
    const fx = drawable.vertices[ci]! - drawable.vertices[ai]!, fy = drawable.vertices[ci + 1]! - drawable.vertices[ai + 1]!;
    const dx = deltas[bi]! - deltas[ai]!, dy = deltas[bi + 1]! - deltas[ai + 1]!;
    const ux = deltas[ci]! - deltas[ai]!, uy = deltas[ci + 1]! - deltas[ai + 1]!;
    const linear = (dx * fy - dy * fx + ex * uy - ey * ux) / before;
    const quadratic = (dx * uy - dy * ux) / before;
    if (Math.abs(quadratic) < 1e-12) {
      if (linear < 0) gain = Math.min(gain, -.82 / linear);
    } else {
      const discriminant = linear * linear - 4 * quadratic * .82;
      if (discriminant > 0) {
        const q = -.5 * (linear + (linear < 0 ? -1 : 1) * Math.sqrt(discriminant));
        for (const root of [q / quadratic, .82 / q]) if (root > 0) gain = Math.min(gain, root);
      }
    }
  }
  const vertices = new Float32Array(drawable.vertices.length);
  for (let i = 0; i < vertices.length; i++) vertices[i] = drawable.vertices[i]! + gain * deltas[i]!;
  return { ...drawable, vertices };
}
/** Root-pinned secondary hair shapes over the current Cubism vertices, before the body rig.
 * Owns backend disposal. All weights come from its neutral mesh; no saved MOC geometry is replaced.
 */
export function createVoidavatarHairBackend(backend: AvatarBackend): AvatarBackend {
  const neutral = backend.sample({}), byId = new Map(neutral.map(drawable => [drawable.id, drawable]));
  const clip = byId.get("HairClip");
  if (!clip) throw new Error("voidavatar hair: HairClip missing");
  let clipBottom = -Infinity;
  for (let i = 1; i < clip.vertices.length; i += 2) clipBottom = Math.max(clipBottom, clip.vertices[i]!);
  const rests = new Map<string, HairRest>(hairIds.map(id => {
    const drawable = byId.get(id); if (!drawable) throw new Error(`voidavatar hair: ${id} missing`);
    return [id, restMesh(drawable, id, clipBottom)];
  }));
  let disposed = false;
  return {
    canvas: backend.canvas, textures: backend.textures,
    sample(parameters) {
      if (disposed) throw new Error("voidavatar hair: backend disposed");
      return backend.sample(parameters).map(drawable => {
        const rest = rests.get(drawable.id); return rest ? bend(rest, drawable, parameters) : drawable;
      });
    },
    dispose() { if (!disposed) { disposed = true; backend.dispose(); } },
  };
}
