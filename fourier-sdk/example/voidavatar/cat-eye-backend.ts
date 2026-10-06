import type { AvatarBackend, AvatarDrawable, AvatarParameters } from "@fourier-video/sdk/avatar";

interface VertexRecipe {
  readonly sources: readonly number[];
  readonly weights: readonly number[];
}
interface EyeWeight {
  readonly y: number;
  readonly weight: number;
  readonly arc: number;
}
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
function openness(parameters: AvatarParameters, key: string): number {
  const value = parameters[key] ?? 1;
  if (!Number.isFinite(value)) throw new Error(`voidavatar cat eyes: ${key} must be finite`);
  return Math.max(0, Math.min(1, value));
}
function interpolate(source: Float32Array, recipes: readonly VertexRecipe[]): Float32Array {
  const output = new Float32Array(recipes.length * 2);
  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i]!;
    let x = 0, y = 0;
    for (let j = 0; j < recipe.sources.length; j++) {
      const vertex = recipe.sources[j]! * 2, weight = recipe.weights[j]!;
      x += source[vertex]! * weight; y += source[vertex + 1]! * weight;
    }
    output[i * 2] = x; output[i * 2 + 1] = y;
  }
  return output;
}
function subdivide(drawable: AvatarDrawable): { readonly recipes: readonly VertexRecipe[]; readonly indices: Uint16Array } {
  const recipes: VertexRecipe[] = Array.from({ length: drawable.vertices.length / 2 }, (_, i) => ({ sources: [i], weights: [1] }));
  let triangles = Array.from(drawable.indices);
  // Four fixed refinement steps resolve the painted eyes. Shared edge splits
  // keep neighboring triangles watertight, including outside the refined area.
  for (let level = 0; level < 4; level++) {
    const edges = new Map<string, number>(), next: number[] = [];
    const positions = interpolate(drawable.vertices, recipes), splitEdges = new Set<string>();
    const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
    for (let i = 0; i < triangles.length; i += 3) {
      const ids = [triangles[i]!, triangles[i + 1]!, triangles[i + 2]!];
      const xs = ids.map(id => positions[id * 2]!), ys = ids.map(id => positions[id * 2 + 1]!);
      const nearEye = Math.min(...ys) <= 1427 && Math.max(...ys) >= 1357
        && [990.2038, 1064.8915].some(x => Math.min(...xs) <= x + 30 && Math.max(...xs) >= x - 30);
      if (nearEye) for (let j = 0; j < 3; j++) splitEdges.add(edgeKey(ids[j]!, ids[(j + 1) % 3]!));
    }
    const midpoint = (a: number, b: number): number => {
      const key = edgeKey(a, b);
      const existing = edges.get(key);
      if (existing !== undefined) return existing;
      const weights = new Map<number, number>();
      for (const id of [a, b]) {
        const recipe = recipes[id]!;
        for (let j = 0; j < recipe.sources.length; j++) {
          const source = recipe.sources[j]!;
          weights.set(source, (weights.get(source) ?? 0) + recipe.weights[j]! / 2);
        }
      }
      const vertex = recipes.length;
      recipes.push({ sources: [...weights.keys()], weights: [...weights.values()] });
      edges.set(key, vertex); return vertex;
    };
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i]!, b = triangles[i + 1]!, c = triangles[i + 2]!;
      const ab = splitEdges.has(edgeKey(a, b)) ? midpoint(a, b) : -1;
      const bc = splitEdges.has(edgeKey(b, c)) ? midpoint(b, c) : -1;
      const ca = splitEdges.has(edgeKey(c, a)) ? midpoint(c, a) : -1;
      const mask = (ab >= 0 ? 1 : 0) + (bc >= 0 ? 2 : 0) + (ca >= 0 ? 4 : 0);
      if (mask === 7) next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      else if (mask === 3) next.push(b, bc, ab, a, ab, c, ab, bc, c);
      else if (mask === 6) next.push(c, ca, bc, b, bc, a, bc, ca, a);
      else if (mask === 5) next.push(a, ab, ca, c, ca, b, ca, ab, b);
      else if (mask === 1) next.push(a, ab, c, ab, b, c);
      else if (mask === 2) next.push(b, bc, a, bc, c, a);
      else if (mask === 4) next.push(c, ca, b, ca, a, b);
      else next.push(a, b, c);
    }
    triangles = next;
  }
  if (recipes.length > 65535) throw new Error("voidavatar cat eyes: subdivided mesh exceeds Uint16 indices");
  return { recipes, indices: new Uint16Array(triangles) };
}
function eyeWeights(vertices: Float32Array, centerX: number, centerY: number): readonly EyeWeight[] {
  return Array.from({ length: vertices.length / 2 }, (_, i) => {
    const x = vertices[i * 2]! - centerX, y = vertices[i * 2 + 1]! - centerY;
    const weight = (1 - smooth((Math.abs(x) - 12) / 16)) * (1 - smooth((Math.abs(y) - 16) / 16));
    return { y, weight, arc: -.8 + .008 * x * x };
  });
}

/** Squashes the cat's original painted white eyes into small smiling arcs.
 * Wrap after cat-ear articulation, before the shared cat rig. All extra vertices
 * and UVs are barycentric samples of the original CatHead triangles; the eyes
 * remain the existing artwork, and the mouth/outline never enter either field.
 */
export function createVoidavatarCatEyeBackend(backend: AvatarBackend): AvatarBackend {
  const head = backend.sample({}).find(drawable => drawable.id === "CatHead");
  if (!head) throw new Error("voidavatar cat eyes: CatHead missing");
  const { recipes, indices } = subdivide(head);
  const rest = interpolate(head.vertices, recipes), uvs = interpolate(head.uvs, recipes);
  // Verified from the exported 4096px atlas, including texel centers: the white
  // eye components are x907..917 / x982..991, y1466..1493. Native UVs convert
  // atlas pixels to canvas via x+77.9773, y-88.0227; the separate mouth is omitted.
  const left = eyeWeights(rest, 990.2038, 1392.2936), right = eyeWeights(rest, 1064.8915, 1392.1635);
  let disposed = false;
  return {
    canvas: backend.canvas, textures: backend.textures,
    sample(parameters) {
      if (disposed) throw new Error("voidavatar cat eyes: backend disposed");
      const leftClose = .91 * (1 - openness(parameters, "CatEyeOpenL"));
      const rightClose = .91 * (1 - openness(parameters, "CatEyeOpenR"));
      return backend.sample(parameters).map(drawable => {
        if (drawable.id !== "CatHead") return drawable;
        if (drawable.vertices.length !== head.vertices.length || drawable.indices.length !== head.indices.length)
          throw new Error("voidavatar cat eyes: CatHead topology changed");
        const vertices = interpolate(drawable.vertices, recipes);
        for (let i = 0; i < recipes.length; i++) {
          const l = left[i]!, r = right[i]!;
          // x remains fixed. The vertical field has derivative >= .09 before
          // sampling, so even a fully closed eye retains positive area.
          vertices[i * 2 + 1] = vertices[i * 2 + 1]!
            + leftClose * l.weight * (l.arc - l.y) + rightClose * r.weight * (r.arc - r.y);
        }
        return { ...drawable, vertices, uvs, indices };
      });
    },
    dispose() { if (!disposed) { disposed = true; backend.dispose(); } },
  };
}
