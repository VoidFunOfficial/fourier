import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import { SdkError } from "./errors.ts";
import type { TimeExpression } from "./project.ts";
import type { TimeValue } from "./schema.ts";

const CAMERA_3D_DEFINITION = Symbol("fourier-camera-3d-definition");
const MATRIX_EPSILON = 1e-12;

export type Camera3DEase =
  | "linear"
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | readonly [number, number, number, number];

/** Camera position and Euler rotation in degrees. */
export interface Camera3DPoseInput {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
}

export interface Camera3DPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
}

export interface Camera3DMove {
  readonly at: TimeExpression;
  readonly duration: TimeExpression;
  readonly to: Camera3DPoseInput;
  readonly ease?: Camera3DEase;
}

export interface Camera3DInput {
  /** Perspective field of view in degrees. Defaults to 50. */
  readonly fov?: number;
  readonly initial?: Camera3DPoseInput;
  readonly moves?: readonly Camera3DMove[];
}

/** Frozen Camera3D definition produced by defineCamera3D(). */
export interface Camera3D {
  readonly fov: number;
  readonly initial: Readonly<Camera3DPose>;
  readonly moves: readonly Camera3DMove[];
  readonly [CAMERA_3D_DEFINITION]: true;
}

export interface Camera3DFrame {
  readonly frame: number;
  readonly pose: Readonly<Camera3DPose>;
  readonly matrix: string;
}

export interface World3DTransform {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
  readonly scale?: number;
}

function fail(code: string, message: string, details?: Record<string, unknown>): never {
  throw new SdkError(code, message, details);
}

function finite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("INVALID_CAMERA_3D", `${field} 必须是有限数`, { field, value });
  }
  return value;
}

function positive(value: unknown, field: string): number {
  const result = finite(value, field);
  if (result <= 0) {
    fail("INVALID_CAMERA_3D", `${field} 必须大于 0`, { field, value });
  }
  return result;
}

function normalizePose(
  value: Camera3DPoseInput | undefined,
  fallback: Camera3DPose,
  field: string,
  requireProperty: boolean,
): Readonly<Camera3DPose> {
  const names = ["x", "y", "z", "rx", "ry", "rz"] as const;
  if (requireProperty && names.every((name) => value?.[name] === undefined)) {
    fail("INVALID_CAMERA_3D", `${field} 至少需要一个 x/y/z/rx/ry/rz 属性`, { field });
  }
  return Object.freeze({
    x: finite(value?.x ?? fallback.x, `${field}.x`),
    y: finite(value?.y ?? fallback.y, `${field}.y`),
    z: finite(value?.z ?? fallback.z, `${field}.z`),
    rx: finite(value?.rx ?? fallback.rx, `${field}.rx`),
    ry: finite(value?.ry ?? fallback.ry, `${field}.ry`),
    rz: finite(value?.rz ?? fallback.rz, `${field}.rz`),
  });
}

function normalizePoseInput(
  value: Camera3DPoseInput,
  field: string,
): Readonly<Camera3DPoseInput> {
  const names = ["x", "y", "z", "rx", "ry", "rz"] as const;
  if (names.every((name) => value?.[name] === undefined)) {
    fail("INVALID_CAMERA_3D", `${field} 至少需要一个 x/y/z/rx/ry/rz 属性`, { field });
  }
  const result: Partial<Record<(typeof names)[number], number>> = {};
  for (const name of names) {
    if (value[name] !== undefined) result[name] = finite(value[name], `${field}.${name}`);
  }
  return Object.freeze(result);
}

function timeExpression(value: TimeExpression, field: string): TimeExpression {
  if (typeof value === "string") {
    if (!/^(?:\d+(?:\.\d+)?(?:ms|s|f))+$/.test(value)) {
      fail("INVALID_CAMERA_3D_TIME", `${field} 不是有效时间: ${value}`, { field, value });
    }
    return value;
  }
  if (
    typeof value !== "object" || value === null ||
    typeof value.source !== "string" ||
    !Number.isInteger(value.frames) || value.frames < 0 ||
    !Number.isFinite(value.seconds) || value.seconds < 0
  ) {
    fail("INVALID_CAMERA_3D_TIME", `${field} 必须是 TimeExpression`, { field });
  }
  return Object.freeze({ ...value });
}

function cameraEase(value: Camera3DEase | undefined, field: string): Camera3DEase {
  const result = value ?? "linear";
  if (typeof result === "string") {
    if (!["linear", "ease", "ease-in", "ease-out", "ease-in-out"].includes(result)) {
      fail("INVALID_CAMERA_3D", `${field} 不是支持的 Camera3D easing`, { field, value: result });
    }
    return result;
  }
  if (
    result.length !== 4 ||
    result.some((entry) => !Number.isFinite(entry)) ||
    result[0] < 0 || result[0] > 1 || result[2] < 0 || result[2] > 1
  ) {
    fail("INVALID_CAMERA_3D", `${field} 必须是有效 cubic-bezier`, { field });
  }
  return Object.freeze([...result]) as Camera3DEase;
}

export function defineCamera3D(input: Camera3DInput): Camera3D {
  if (typeof input !== "object" || input === null) {
    fail("INVALID_CAMERA_3D", "defineCamera3D() 需要配置对象");
  }
  const origin = Object.freeze({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
  const initial = normalizePose(input.initial, origin, "camera3D.initial", false);
  const fov = positive(input.fov ?? 50, "camera3D.fov");
  if (fov >= 180) {
    fail("INVALID_CAMERA_3D", "camera3D.fov 必须小于 180", { fov });
  }
  const moves = Object.freeze((input.moves ?? []).map((move, index) => {
    if (typeof move !== "object" || move === null) {
      fail("INVALID_CAMERA_3D", `camera3D.moves[${index}] 必须是对象`);
    }
    return Object.freeze({
      at: timeExpression(move.at, `camera3D.moves[${index}].at`),
      duration: timeExpression(move.duration, `camera3D.moves[${index}].duration`),
      to: normalizePoseInput(move.to, `camera3D.moves[${index}].to`),
      ease: cameraEase(move.ease, `camera3D.moves[${index}].ease`),
    });
  }));
  return Object.freeze({
    fov,
    initial,
    moves,
    [CAMERA_3D_DEFINITION]: true as const,
  });
}

export function isCamera3D(value: unknown): value is Camera3D {
  return typeof value === "object" && value !== null &&
    (value as Record<PropertyKey, unknown>)[CAMERA_3D_DEFINITION] === true;
}

function resolveTimeFrames(value: TimeExpression, fps: number, field: string): number {
  positive(fps, "composition.fps");
  if (typeof value !== "string") return (value as TimeValue).frames;
  const pattern = /(\d+(?:\.\d+)?)(ms|s|f)/g;
  let frames = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    const amount = Number(match[1]);
    frames += match[2] === "f" ? amount : match[2] === "s"
      ? amount * fps
      : amount * fps / 1_000;
  }
  const rounded = Math.round(frames);
  if (!Number.isSafeInteger(rounded) || rounded < 0) {
    fail("INVALID_CAMERA_3D_TIME", `${field} 超出可用帧范围`, { field, value });
  }
  return rounded;
}

function cubicCoordinate(
  start: number,
  first: number,
  second: number,
  end: number,
  progress: number,
): number {
  const inverse = 1 - progress;
  return inverse ** 3 * start + 3 * inverse ** 2 * progress * first +
    3 * inverse * progress ** 2 * second + progress ** 3 * end;
}

function cubicBezier(progress: number, values: readonly [number, number, number, number]): number {
  const [x1, y1, x2, y2] = values;
  let parameter = progress;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const x = cubicCoordinate(0, x1, x2, 1, parameter) - progress;
    const derivative = 3 * (1 - parameter) ** 2 * x1 +
      6 * (1 - parameter) * parameter * (x2 - x1) +
      3 * parameter ** 2 * (1 - x2);
    if (Math.abs(derivative) < 1e-7) break;
    parameter = Math.min(1, Math.max(0, parameter - x / derivative));
  }
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const x = cubicCoordinate(0, x1, x2, 1, parameter);
    if (Math.abs(x - progress) < 1e-7) break;
    if (x < progress) low = parameter;
    else high = parameter;
    parameter = (low + high) / 2;
  }
  return cubicCoordinate(0, y1, y2, 1, parameter);
}

function easedProgress(progress: number, value: Camera3DEase): number {
  const curves: Record<Exclude<Camera3DEase, readonly number[]>, readonly [number, number, number, number]> = {
    linear: [0, 0, 1, 1],
    ease: [0.25, 0.1, 0.25, 1],
    "ease-in": [0.42, 0, 1, 1],
    "ease-out": [0, 0, 0.58, 1],
    "ease-in-out": [0.42, 0, 0.58, 1],
  };
  return cubicBezier(progress, typeof value === "string" ? curves[value] : value);
}

function interpolatePose(
  start: Camera3DPose,
  end: Camera3DPose,
  progress: number,
): Readonly<Camera3DPose> {
  const lerp = (left: number, right: number) => left + (right - left) * progress;
  return Object.freeze({
    x: lerp(start.x, end.x),
    y: lerp(start.y, end.y),
    z: lerp(start.z, end.z),
    rx: lerp(start.rx, end.rx),
    ry: lerp(start.ry, end.ry),
    rz: lerp(start.rz, end.rz),
  });
}

function matrix3D(matrix: Matrix4): string {
  const values = matrix.elements.map((value) =>
    Math.abs(value) < MATRIX_EPSILON ? 0 : Number(value.toFixed(12))
  );
  return `matrix3d(${values.join(", ")})`;
}

/** Three.js camera inverse matrix serialized for a CSS 3D world plane. */
export function camera3DMatrix(pose: Camera3DPose): string {
  const position = new Vector3(pose.x, pose.y, pose.z);
  const quaternion = new Quaternion().setFromEuler(new Euler(
    MathUtils.degToRad(pose.rx),
    MathUtils.degToRad(pose.ry),
    MathUtils.degToRad(pose.rz),
    "XYZ",
  ));
  const world = new Matrix4().compose(position, quaternion, new Vector3(1, 1, 1));
  return matrix3D(world.invert());
}

/** Three.js object matrix serialized for a CSS 3D World3D node. */
export function world3DMatrix(transform: World3DTransform): string {
  const scale = positive(transform.scale ?? 1, "World3D.scale");
  const position = new Vector3(
    finite(transform.x, "World3D.x"),
    finite(transform.y, "World3D.y"),
    finite(transform.z, "World3D.z"),
  );
  const quaternion = new Quaternion().setFromEuler(new Euler(
    MathUtils.degToRad(finite(transform.rx ?? 0, "World3D.rx")),
    MathUtils.degToRad(finite(transform.ry ?? 0, "World3D.ry")),
    MathUtils.degToRad(finite(transform.rz ?? 0, "World3D.rz")),
    "XYZ",
  ));
  return matrix3D(new Matrix4().compose(position, quaternion, new Vector3(scale, scale, scale)));
}

export function camera3DPerspective(camera: Camera3D, viewportHeight: number): number {
  const height = positive(viewportHeight, "Universe3D.viewportHeight");
  return height / (2 * Math.tan(MathUtils.degToRad(camera.fov) / 2));
}

interface ResolvedMove {
  readonly startFrame: number;
  readonly endFrame: number;
  readonly start: Readonly<Camera3DPose>;
  readonly end: Readonly<Camera3DPose>;
  readonly ease: Camera3DEase;
}

export function resolveCamera3DFrames(input: {
  readonly camera: Camera3D;
  readonly fps: number;
  readonly durationInFrames: number;
}): readonly Camera3DFrame[] {
  if (!isCamera3D(input.camera)) {
    fail("INVALID_CAMERA_3D", "camera 必须由 defineCamera3D() 创建");
  }
  if (!Number.isSafeInteger(input.durationInFrames) || input.durationInFrames <= 0) {
    fail("INVALID_CAMERA_3D", "composition.durationInFrames 必须是正整数");
  }
  let previousEnd = 0;
  let cursor = input.camera.initial;
  const moves: readonly ResolvedMove[] = input.camera.moves.map((move, index) => {
    const startFrame = resolveTimeFrames(move.at, input.fps, `camera3D.moves[${index}].at`);
    const durationFrames = resolveTimeFrames(
      move.duration,
      input.fps,
      `camera3D.moves[${index}].duration`,
    );
    if (durationFrames <= 0) {
      fail("INVALID_CAMERA_3D_TIME", `camera3D.moves[${index}].duration 必须至少为 1 frame`, {
        index,
      });
    }
    const endFrame = startFrame + durationFrames;
    if (startFrame < previousEnd) {
      fail("CAMERA_3D_MOVE_OVERLAP", `camera3D.moves[${index}] 与前一个 Move 重叠`, { index });
    }
    if (endFrame > input.durationInFrames) {
      fail("CAMERA_3D_MOVE_OUT_OF_RANGE", `camera3D.moves[${index}] 超出 artifact duration`, {
        index,
        endFrame,
        durationInFrames: input.durationInFrames,
      });
    }
    const end = normalizePose(move.to, cursor, `camera3D.moves[${index}].to`, true);
    const resolved = Object.freeze({
      startFrame,
      endFrame,
      start: cursor,
      end,
      ease: move.ease ?? "linear",
    });
    previousEnd = endFrame;
    cursor = end;
    return resolved;
  });

  const frames: Camera3DFrame[] = [];
  for (let frame = 0; frame <= input.durationInFrames; frame += 1) {
    let pose = input.camera.initial;
    for (const move of moves) {
      if (frame < move.startFrame) break;
      if (frame >= move.endFrame) {
        pose = move.end;
        continue;
      }
      pose = interpolatePose(
        move.start,
        move.end,
        easedProgress(
          (frame - move.startFrame) / (move.endFrame - move.startFrame),
          move.ease,
        ),
      );
      break;
    }
    frames.push(Object.freeze({ frame, pose, matrix: camera3DMatrix(pose) }));
  }
  return Object.freeze(frames);
}
