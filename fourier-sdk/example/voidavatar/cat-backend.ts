import type { AvatarBackend, AvatarDrawable, AvatarParameters } from "@fourier-video/sdk/avatar";

interface CatRest {
  readonly vertices: Float32Array;
  readonly indexCount: number;
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smooth = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
function channel(parameters: AvatarParameters, name: string): number {
  const value = parameters[name] ?? 0;
  if (!Number.isFinite(value)) throw new Error(`voidavatar cat: ${name} must be finite`);
  return clamp(value, -1, 1);
}
function pose(drawable: AvatarDrawable, rest: CatRest, parameters: AvatarParameters): AvatarDrawable {
  if (drawable.vertices.length !== rest.vertices.length || drawable.indices.length !== rest.indexCount)
    throw new Error(`voidavatar cat: topology changed for ${drawable.id}`);
  const tail = drawable.id === "CatTail";
  const curl = tail ? channel(parameters, "CatTailCurl") : 0;
  const left = tail ? 0 : channel(parameters, "CatEarL");
  const right = tail ? 0 : channel(parameters, "CatEarR");
  if (curl === 0 && left === 0 && right === 0) return drawable;
  const vertices = new Float32Array(drawable.vertices);
  for (let i = 0; i < vertices.length; i += 2) {
    const x = rest.vertices[i]!, y = rest.vertices[i + 1]!;
    let dx = 0, dy = 0;
    if (tail) {
      // The neutral tail curls upward from the lower-left root under CatBody.
      // A radial twist preserves the thick silhouette; the entire root disk
      // stays rigid, and the angle has zero derivative at both blend boundaries.
      const rx = x - 1128, ry = y - 1480;
      const angle = .4 * curl * smooth((Math.hypot(rx, ry) - 34) / 74);
      if (angle === 0) continue;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      dx = cos * rx - sin * ry - rx;
      dy = sin * rx + cos * ry - ry;
    } else {
      // Only the ear tips move. The central forehead, eyes, mouth and every
      // vertex below y=1340 retain their current native coordinates exactly.
      const height = smooth((1340 - y) / 50);
      const leftWeight = height * smooth((1005 - x) / 35);
      const rightWeight = height * smooth((x - 1056) / 30);
      dx = -9.5 * left * leftWeight + 9.5 * right * rightWeight;
      dy = 4 * left * leftWeight + 4 * right * rightWeight;
    }
    vertices[i] = vertices[i]! + dx;
    vertices[i + 1] = vertices[i + 1]! + dy;
  }
  return { ...drawable, vertices };
}

/** Local ear and root-pinned tail articulation before the common cat/body rig.
 * Uses the original Cubism meshes and owns disposal of the wrapped backend.
 */
export function createVoidavatarCatBackend(backend: AvatarBackend): AvatarBackend {
  const neutral = backend.sample({});
  const rests = new Map<string, CatRest>();
  for (const id of ["CatHead", "CatTail"]) {
    const drawable = neutral.find(item => item.id === id);
    if (!drawable) throw new Error(`voidavatar cat: ${id} missing`);
    rests.set(id, { vertices: new Float32Array(drawable.vertices), indexCount: drawable.indices.length });
  }
  let disposed = false;
  return {
    canvas: backend.canvas, textures: backend.textures,
    sample(parameters) {
      if (disposed) throw new Error("voidavatar cat: backend disposed");
      return backend.sample(parameters).map(drawable => {
        const rest = rests.get(drawable.id);
        return rest ? pose(drawable, rest, parameters) : drawable;
      });
    },
    dispose() { if (!disposed) { disposed = true; backend.dispose(); } },
  };
}
