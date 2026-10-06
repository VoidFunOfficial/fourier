import type { AvatarBackend, AvatarDrawable, AvatarParameters } from "@fourier-video/sdk/avatar";

export interface HandPropDefinition {
  readonly id: string;
  readonly texture: string;
  /** Rectangle in normalized full-PNG UV coordinates. */
  readonly region: readonly [number, number, number, number];
  /** Grip point in normalized full-PNG coordinates, inside region. */
  readonly grip: readonly [number, number];
  /** Full PNG pixel dimensions; the cropped region retains its aspect ratio. */
  readonly canvas: readonly [number, number];
  /** Cropped region height in the 1600-pixel model canvas. */
  readonly height: number;
  /** Additional clockwise angle in degrees. */
  readonly rotationOffset?: number;
}
interface Barycentric { readonly ids: readonly [number, number, number]; readonly weights: readonly [number, number, number] }
interface ClipPoint { readonly x: number; readonly y: number; readonly weights: readonly [number, number, number] }
interface HandReference {
  readonly side: "L" | "R";
  readonly neutral: Float32Array;
  readonly grip: Barycentric;
  readonly fit: readonly number[];
  readonly center: readonly [number, number];
  readonly patch: readonly Barycentric[];
  readonly patchUvs: Float32Array;
  readonly patchIndices: Uint16Array;
}
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function value(parameters: AvatarParameters, name: string, fallback: number, lo: number, hi: number): number {
  const n = parameters[name] ?? fallback;
  if (!Number.isFinite(n)) throw new Error(`voidavatar hand props: ${name} must be finite`);
  return clamp(n, lo, hi);
}
function selection(parameters: AvatarParameters, side: string, count: number): number {
  const n = parameters[`HandProp${side}`] ?? 0;
  if (!Number.isInteger(n) || n < 0 || n > count) throw new Error(`voidavatar hand props: HandProp${side} must be an integer from 0 to ${count}`);
  return n;
}
function validateDefinitions(props: readonly HandPropDefinition[]): readonly HandPropDefinition[] {
  if (props.length > 10) throw new Error("voidavatar hand props: at most ten definitions are supported");
  const ids = new Set<string>();
  return props.map(prop => {
    if (!prop.id || ids.has(prop.id) || !prop.texture) throw new Error("voidavatar hand props: unique id and texture are required");
    ids.add(prop.id);
    const [u0, v0, u1, v1] = prop.region, [gx, gy] = prop.grip, [width, height] = prop.canvas;
    if (![u0, v0, u1, v1, gx, gy, width, height, prop.height, prop.rotationOffset ?? 0].every(Number.isFinite)
      || u0 < 0 || v0 < 0 || u1 > 1 || v1 > 1 || u0 >= u1 || v0 >= v1
      || gx < u0 || gx > u1 || gy < v0 || gy > v1 || width <= 0 || height <= 0 || prop.height <= 0)
      throw new Error(`voidavatar hand props: invalid region, grip or dimensions for ${prop.id}`);
    return Object.freeze({ ...prop, region: Object.freeze([...prop.region]) as HandPropDefinition["region"],
      grip: Object.freeze([...prop.grip]) as HandPropDefinition["grip"], canvas: Object.freeze([...prop.canvas]) as HandPropDefinition["canvas"] });
  });
}
function samplePoint(reference: Barycentric, vertices: Float32Array): readonly [number, number] {
  let x = 0, y = 0;
  for (let i = 0; i < 3; i++) { x += vertices[reference.ids[i]! * 2]! * reference.weights[i]!; y += vertices[reference.ids[i]! * 2 + 1]! * reference.weights[i]!; }
  return [x, y];
}
function barycentric(drawable: AvatarDrawable, x: number, y: number): Barycentric {
  for (let i = 0; i < drawable.indices.length; i += 3) {
    const ids = [drawable.indices[i]!, drawable.indices[i + 1]!, drawable.indices[i + 2]!] as const;
    const [a, b, c] = ids.map(id => [drawable.vertices[id * 2]!, drawable.vertices[id * 2 + 1]!] as const);
    const ex = b![0] - a![0], ey = b![1] - a![1], fx = c![0] - a![0], fy = c![1] - a![1];
    const determinant = ex * fy - ey * fx;
    if (Math.abs(determinant) < 1e-8) continue;
    const wb = ((x - a![0]) * fy - (y - a![1]) * fx) / determinant;
    const wc = (ex * (y - a![1]) - ey * (x - a![0])) / determinant, wa = 1 - wb - wc;
    if (Math.min(wa, wb, wc) >= -1e-6) return { ids, weights: [wa, wb, wc] };
  }
  throw new Error(`voidavatar hand props: palm grip is outside ${drawable.id}`);
}
function clip(points: readonly ClipPoint[], polygon: readonly (readonly [number, number])[]): readonly ClipPoint[] {
  let output = [...points];
  for (let edge = 0; edge < polygon.length; edge++) {
    const a = polygon[edge]!, b = polygon[(edge + 1) % polygon.length]!;
    const distance = (point: ClipPoint) => (b[0] - a[0]) * (point.y - a[1]) - (b[1] - a[1]) * (point.x - a[0]);
    const input = output; output = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i]!, prior = input[(i + input.length - 1) % input.length]!, dc = distance(current), dp = distance(prior);
      if ((dc >= 0) !== (dp >= 0)) {
        const t = dp / (dp - dc);
        output.push({ x: prior.x + (current.x - prior.x) * t, y: prior.y + (current.y - prior.y) * t,
          weights: [prior.weights[0] + (current.weights[0] - prior.weights[0]) * t,
            prior.weights[1] + (current.weights[1] - prior.weights[1]) * t, prior.weights[2] + (current.weights[2] - prior.weights[2]) * t] });
      }
      if (dc >= 0) output.push(current);
    }
    if (!output.length) break;
  }
  return output;
}
function reference(drawable: AvatarDrawable, side: "L" | "R"): HandReference {
  const center = [side === "L" ? 475 : 939, 1211] as const;
  const neutral = new Float32Array(drawable.vertices), grip = barycentric(drawable, ...center);
  const fit = Array.from({ length: neutral.length / 2 }, (_, i) => i).filter(i => neutral[i * 2 + 1]! >= 1195
    && Math.hypot(neutral[i * 2]! - center[0], neutral[i * 2 + 1]! - center[1]) < 48);
  if (fit.length < 3) throw new Error(`voidavatar hand props: insufficient palm vertices for ${side}`);
  // Measured from the existing pink hand artwork, not the white sleeve bounds.
  // Clipping each original triangle retains exactly its barycentric atlas UVs.
  const leftPolygon = [[440, 1185], [457, 1183], [479, 1192], [504, 1215], [504, 1240], [440, 1240]] as const;
  const polygon: readonly (readonly [number, number])[] = side === "L" ? leftPolygon
    : leftPolygon.map(([x, y]) => [1414 - x, y] as const).reverse();
  const patch: Barycentric[] = [], uvValues: number[] = [], indexValues: number[] = [];
  for (let i = 0; i < drawable.indices.length; i += 3) {
    const ids = [drawable.indices[i]!, drawable.indices[i + 1]!, drawable.indices[i + 2]!] as const;
    const points = clip(ids.map((id, j) => ({ x: neutral[id * 2]!, y: neutral[id * 2 + 1]!,
      weights: [j === 0 ? 1 : 0, j === 1 ? 1 : 0, j === 2 ? 1 : 0] as const })), polygon);
    if (points.length < 3) continue;
    const start = patch.length;
    for (const point of points) {
      patch.push({ ids, weights: point.weights });
      uvValues.push(...samplePoint({ ids, weights: point.weights }, drawable.uvs));
    }
    for (let j = 1; j < points.length - 1; j++) indexValues.push(start, start + j, start + j + 1);
  }
  if (!patch.length) throw new Error(`voidavatar hand props: empty palm patch for ${side}`);
  return { side, neutral, grip, fit, center, patch, patchUvs: new Float32Array(uvValues), patchIndices: new Uint16Array(indexValues) };
}
function handPose(rest: HandReference, current: AvatarDrawable): { readonly x: number; readonly y: number; readonly angle: number } {
  if (current.vertices.length !== rest.neutral.length) throw new Error(`voidavatar hand props: palm topology changed for ${rest.side}`);
  let rx = 0, ry = 0, cx = 0, cy = 0;
  for (const id of rest.fit) { rx += rest.neutral[id * 2]!; ry += rest.neutral[id * 2 + 1]!; cx += current.vertices[id * 2]!; cy += current.vertices[id * 2 + 1]!; }
  rx /= rest.fit.length; ry /= rest.fit.length; cx /= rest.fit.length; cy /= rest.fit.length;
  let dot = 0, cross = 0;
  for (const id of rest.fit) {
    const x = rest.neutral[id * 2]! - rx, y = rest.neutral[id * 2 + 1]! - ry;
    const u = current.vertices[id * 2]! - cx, v = current.vertices[id * 2 + 1]! - cy;
    dot += x * u + y * v; cross += x * v - y * u;
  }
  const [x, y] = samplePoint(rest.grip, current.vertices);
  if (![x, y, dot, cross].every(Number.isFinite) || Math.hypot(dot, cross) < 1e-8) throw new Error("voidavatar hand props: invalid palm pose");
  return { x, y, angle: Math.atan2(cross, dot) };
}
function propDrawable(rest: HandReference, sleeve: AvatarDrawable, definition: HandPropDefinition | undefined, parameters: AvatarParameters,
  opacity: number, order: number): AvatarDrawable {
  const pose = handPose(rest, sleeve), scale = value(parameters, "PropScale", 1, .5, 1.5);
  const rotation = value(parameters, "PropAngle", 0, -45, 45);
  const region = definition?.region ?? [0, 0, 1, 1], grip = definition?.grip ?? [.5, .5], canvas = definition?.canvas ?? [1, 1];
  const factor = (definition?.height ?? 1) * scale / ((region[3] - region[1]) * canvas[1]);
  // A palm-held shaft points outward when lowered and upright when greeting.
  // This fixed local grip angle is then carried by the sampled hand itself.
  const angle = pose.angle + ((rest.side === "L" ? -70 : 70) + rotation + (definition?.rotationOffset ?? 0)) * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle), vertices = new Float32Array(8);
  const corners = [[region[0], region[1]], [region[2], region[1]], [region[2], region[3]], [region[0], region[3]]] as const;
  for (let i = 0; i < corners.length; i++) {
    const x = (corners[i]![0] - grip[0]) * canvas[0] * factor, y = (corners[i]![1] - grip[1]) * canvas[1] * factor;
    vertices[i * 2] = pose.x + cos * x - sin * y; vertices[i * 2 + 1] = pose.y + sin * x + cos * y;
  }
  return { id: `HandProp${rest.side}`, texture: definition?.texture ?? sleeve.texture, vertices,
    uvs: new Float32Array(corners.flat()), indices: quadIndices, opacity: opacity * sleeve.opacity, order, masks: [], blend: "normal" };
}
function gripDrawable(rest: HandReference, sleeve: AvatarDrawable, opacity: number, order: number): AvatarDrawable {
  const vertices = new Float32Array(rest.patch.length * 2);
  rest.patch.forEach((point, i) => vertices.set(samplePoint(point, sleeve.vertices), i * 2));
  return { ...sleeve, id: `HandGrip${rest.side}`, vertices, uvs: rest.patchUvs, indices: rest.patchIndices, order, opacity: opacity * sleeve.opacity };
}
/** Rigid hand-held sprites tracked from the already bent MOC palms, before the shared body rig.
 * Both prop and small original-hand occlusion layers always exist, with opacity zero for none.
 * The wrapper owns disposal of its upstream backend; it never changes the original drawables.
 */
export function createVoidavatarHandPropsBackend(backend: AvatarBackend, props: readonly HandPropDefinition[]): AvatarBackend {
  const definitions = validateDefinitions(props), neutral = backend.sample({});
  const refs = (["L", "R"] as const).map(side => {
    const sleeve = neutral.find(d => d.id === `Sleeve${side}`);
    if (!sleeve) throw new Error(`voidavatar hand props: Sleeve${side} missing`);
    return reference(sleeve, side);
  });
  let disposed = false;
  return {
    canvas: backend.canvas, textures: Object.freeze([...new Set([...backend.textures, ...definitions.map(prop => prop.texture)])]),
    sample(parameters) {
      if (disposed) throw new Error("voidavatar hand props: backend disposed");
      const chosen = refs.map(rest => selection(parameters, rest.side, definitions.length));
      const opacity = value(parameters, "PropOpacity", 1, 0, 1);
      value(parameters, "PropScale", 1, .5, 1.5); value(parameters, "PropAngle", 0, -45, 45);
      const originals = backend.sample(parameters), result = [...originals], byId = new Map(originals.map(d => [d.id, d]));
      const torso = byId.get("HoodieTorso");
      if (!torso) throw new Error("voidavatar hand props: HoodieTorso missing");
      const foregroundOrder = Math.max(...originals.map(drawable => drawable.order)) + 1;
      for (let i = 0; i < refs.length; i++) {
        const rest = refs[i]!, sleeve = byId.get(`Sleeve${rest.side}`);
        if (!sleeve) throw new Error(`voidavatar hand props: Sleeve${rest.side} missing`);
        const selected = chosen[i]!, definition = definitions[selected - 1] ?? definitions[0], weight = selected === 0 ? 0 : opacity;
        // Held items stay in front of foreground hair; only their palm patch overlaps them.
        const order = foregroundOrder + i * .2;
        result.push(propDrawable(rest, sleeve, definition, parameters, weight, order));
        result.push(gripDrawable(rest, sleeve, weight, order + .05));
      }
      return result.sort((a, b) => a.order - b.order);
    },
    dispose() { if (!disposed) { disposed = true; backend.dispose(); } },
  };
}
