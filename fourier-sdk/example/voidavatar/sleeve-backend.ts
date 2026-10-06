import type { AvatarBackend, AvatarDrawable, AvatarParameters } from "@fourier-video/sdk/avatar";

type SleeveId = "SleeveL" | "SleeveR";
interface SleeveRest {
  readonly id: SleeveId;
  readonly vertices: Float32Array;
  readonly originX: number;
  readonly originY: number;
  readonly directionX: number;
  readonly directionY: number;
  readonly side: -1 | 1;
  readonly longitudinal: Float32Array;
  readonly transverse: Float32Array;
}
const radians = Math.PI / 180;
const pinnedLength = 30;
const bendLength = 245;
const wristStart = 205;
const wristEnd = 290;
function channel(parameters: AvatarParameters, name: string): number {
  const value = parameters[name] ?? 0;
  if (!Number.isFinite(value)) throw new Error(`voidavatar sleeve: ${name} must be finite`);
  return Math.max(-1, Math.min(1, value));
}
function restMesh(drawable: AvatarDrawable, id: SleeveId): SleeveRest {
  const side = id === "SleeveL" ? -1 : 1;
  const originX = side === -1 ? 598 : 812, originY = 942;
  const directionX = side * .38, directionY = Math.sqrt(1 - .38 ** 2);
  const vertices = new Float32Array(drawable.vertices);
  const longitudinal = new Float32Array(vertices.length / 2), transverse = new Float32Array(vertices.length / 2);
  for (let i = 0; i < longitudinal.length; i++) {
    const x = vertices[i * 2]! - originX, y = vertices[i * 2 + 1]! - originY;
    longitudinal[i] = x * directionX + y * directionY;
    transverse[i] = x * directionY - y * directionX;
  }
  return { id, vertices, originX, originY, directionX, directionY, side, longitudinal, transverse };
}
function bend(rest: SleeveRest, drawable: AvatarDrawable, parameters: AvatarParameters): AvatarDrawable {
  if (drawable.vertices.length !== rest.vertices.length) throw new Error(`voidavatar sleeve: topology changed for ${rest.id}`);
  const arm = channel(parameters, rest.id === "SleeveL" ? "ArmL" : "ArmR");
  const hand = channel(parameters, rest.id === "SleeveL" ? "HandL" : "HandR");
  const follow = channel(parameters, "SleeveFollow");
  if (arm === 0 && hand === 0 && follow === 0) return drawable;
  const armCurvature = -rest.side * (132 * arm + 3 * follow) * radians / bendLength;
  const wristCurvature = hand * 10 * radians / (wristEnd - wristStart);
  // Arc length, rather than blending two rigid rotations, keeps the sleeve
  // width while its shoulder cap stays sewn beneath the unchanged hoodie.
  // The last section bends the cuff independently for the waving hand.
  const sections = [
    [0, wristStart, armCurvature],
    [wristStart, bendLength, armCurvature + wristCurvature],
    [bendLength, wristEnd, wristCurvature],
    [wristEnd, Infinity, 0],
  ] as const;
  const vertices = new Float32Array(drawable.vertices);
  const dx = rest.directionX, dy = rest.directionY;
  for (let i = 0; i < rest.longitudinal.length; i++) {
    const distance = rest.longitudinal[i]! - pinnedLength;
    if (distance <= 0) continue;
    let x = rest.originX + pinnedLength * dx, y = rest.originY + pinnedLength * dy, angle = 0;
    for (const [start, end, curvature] of sections) {
      const length = Math.max(0, Math.min(distance, end) - start);
      if (length === 0) continue;
      const c = Math.cos(angle), s = Math.sin(angle), tx = c * dx - s * dy, ty = s * dx + c * dy;
      const turn = curvature * length;
      if (Math.abs(turn) < 1e-7) { x += tx * length; y += ty * length; }
      else {
        x += (tx * Math.sin(turn) + ty * (Math.cos(turn) - 1)) / curvature;
        y += (tx * (1 - Math.cos(turn)) + ty * Math.sin(turn)) / curvature;
      }
      angle += turn;
    }
    const normal = rest.transverse[i]!, c = Math.cos(angle), s = Math.sin(angle);
    x += normal * (c * dy + s * dx); y += normal * (s * dy - c * dx);
    // Delta application retains any native translation without replacing
    // the MOC vertices or changing atlas UVs, triangle indices or layering.
    vertices[i * 2] = drawable.vertices[i * 2]! + x - rest.vertices[i * 2]!;
    vertices[i * 2 + 1] = drawable.vertices[i * 2 + 1]! + y - rest.vertices[i * 2 + 1]!;
  }
  return { ...drawable, vertices };
}
/** Shoulder-pinned arm articulation over the existing MOC sleeve artwork.
 * Owns backend disposal; each pose is computed from the original neutral mesh.
 */
export function createVoidavatarSleeveBackend(backend: AvatarBackend): AvatarBackend {
  const neutral = backend.sample({});
  const rests = new Map<string, SleeveRest>((["SleeveL", "SleeveR"] as const).map(id => {
    const drawable = neutral.find(item => item.id === id);
    if (!drawable) throw new Error(`voidavatar sleeve: ${id} missing`);
    return [id, restMesh(drawable, id)];
  }));
  let disposed = false;
  return {
    canvas: backend.canvas, textures: backend.textures,
    sample(parameters) {
      if (disposed) throw new Error("voidavatar sleeve: backend disposed");
      return backend.sample(parameters).map(drawable => {
        const rest = rests.get(drawable.id);
        return rest ? bend(rest, drawable, parameters) : drawable;
      });
    },
    dispose() { if (!disposed) { disposed = true; backend.dispose(); } },
  };
}
