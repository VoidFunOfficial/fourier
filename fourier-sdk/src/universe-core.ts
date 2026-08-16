import { SdkError } from "./errors.ts";
import type { TimeExpression } from "./project.ts";
import type { TimeValue } from "./schema.ts";

const CAMERA_DEFINITION = Symbol("fourier-camera-definition");
const CAMERA_PROGRAM_DEFINITION = Symbol("fourier-camera-program-definition");
const ASPECT_EPSILON = 1e-6;
const GEOMETRY_EPSILON = 1e-9;

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

export interface WorldAnchor {
  readonly x: number;
  readonly y: number;
}

export interface CameraInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export type CameraPadding = number | CameraInsets;
export type CameraFitMode = "contain" | "cover" | "width" | "height";
export type CameraEase =
  | "linear"
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | readonly [number, number, number, number];

export interface CameraPathSampleContext {
  readonly start: WorldPoint;
  readonly end: WorldPoint;
}

export type CameraPath =
  | { readonly kind: "linear" }
  | {
      readonly kind: "bezier";
      readonly control1: WorldPoint;
      readonly control2: WorldPoint;
    }
  | {
      readonly kind: "arc";
      readonly center: WorldPoint;
      readonly direction?: "shortest" | "clockwise" | "counterclockwise";
      readonly turns?: number;
    }
  | {
      readonly kind: "curve";
      readonly points: readonly [WorldPoint, ...WorldPoint[]];
    }
  | {
      readonly kind: "custom";
      readonly sample: (
        progress: number,
        context: Readonly<CameraPathSampleContext>,
      ) => WorldPoint;
    };

export interface CameraPoseTarget {
  readonly kind: "pose";
  readonly x?: number;
  readonly y?: number;
  readonly zoom?: number;
  readonly rotation?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface CameraFitTarget {
  readonly kind: "fit";
  readonly target: string;
  readonly fit: CameraFitMode;
  readonly padding?: CameraPadding;
}

export type CameraTarget = CameraPoseTarget | CameraFitTarget;

export interface CameraMove {
  readonly at: TimeExpression;
  readonly duration: TimeExpression;
  readonly to: CameraTarget;
  readonly path?: CameraPath;
  readonly ease?: CameraEase;
}

export interface CameraInitial {
  readonly x?: number;
  readonly y?: number;
  readonly zoom?: number;
  readonly rotation?: number;
}

export interface CameraDefinitionInput {
  readonly width: number;
  readonly height: number;
  readonly initial?: CameraInitial;
  readonly moves?: readonly CameraMove[];
}

export interface CameraDefinition {
  readonly width: number;
  readonly height: number;
  readonly initial: Readonly<Required<CameraInitial>>;
  readonly moves: readonly CameraMove[];
  readonly [CAMERA_DEFINITION]: true;
}

export interface CameraCut {
  readonly at: TimeExpression;
  readonly to: string;
}

export interface CameraProgramInput {
  readonly cameras: Readonly<Record<string, CameraDefinition>>;
  readonly initialCamera: string;
  readonly cuts?: readonly CameraCut[];
}

export interface CameraProgramDefinition {
  readonly cameras: Readonly<Record<string, CameraDefinition>>;
  readonly initialCamera: string;
  readonly cuts: readonly CameraCut[];
  readonly [CAMERA_PROGRAM_DEFINITION]: true;
}

export type CameraSource = CameraDefinition | CameraProgramDefinition;

export interface CameraPose {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly rotation: number;
  readonly width: number;
  readonly height: number;
}

export interface WorldBounds {
  readonly id: string;
  readonly polygon: readonly [WorldPoint, WorldPoint, WorldPoint, WorldPoint];
  readonly cull: "auto" | "never";
  readonly element: HTMLElement;
}

export type WorldVisibility = "visible" | "near-visible" | "invisible";

export interface UniverseFrame {
  readonly frame: number;
  readonly pose: CameraPose;
  readonly matrix: string;
  /** True when this sample starts a different active Camera. */
  readonly cut?: true;
}

function fail(code: string, message: string, details?: Record<string, unknown>): never {
  throw new SdkError(code, message, details);
}

function finite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("INVALID_CAMERA", `${field} 必须是有限数`, { field, value });
  }
  return value;
}

function positive(value: unknown, field: string): number {
  const result = finite(value, field);
  if (result <= 0) fail("INVALID_CAMERA", `${field} 必须大于 0`, { field, value });
  return result;
}

function point(value: WorldPoint, field: string): Readonly<WorldPoint> {
  return Object.freeze({
    x: finite(value?.x, `${field}.x`),
    y: finite(value?.y, `${field}.y`),
  });
}

function timeExpression(value: TimeExpression, field: string): TimeExpression {
  if (typeof value === "string") {
    if (!/^(?:\d+(?:\.\d+)?(?:ms|s|f))+$/.test(value)) {
      fail("INVALID_CAMERA_TIME", `${field} 不是有效时间: ${value}`, { field, value });
    }
    return value;
  }
  if (
    typeof value !== "object" || value === null ||
    typeof value.source !== "string" ||
    !Number.isInteger(value.frames) || value.frames < 0 ||
    !Number.isFinite(value.seconds) || value.seconds < 0
  ) {
    fail("INVALID_CAMERA_TIME", `${field} 必须是 TimeExpression`, { field });
  }
  return Object.freeze({ ...value });
}

function cameraEase(value: CameraEase | undefined, field: string): CameraEase {
  const result = value ?? "linear";
  if (typeof result === "string") {
    if (!["linear", "ease", "ease-in", "ease-out", "ease-in-out"].includes(result)) {
      fail("INVALID_CAMERA", `${field} 不是支持的 Camera easing`, { field, value: result });
    }
    return result;
  }
  if (
    result.length !== 4 ||
    result.some((entry) => !Number.isFinite(entry)) ||
    result[0] < 0 || result[0] > 1 || result[2] < 0 || result[2] > 1
  ) {
    fail("INVALID_CAMERA", `${field} 必须是有效 cubic-bezier`, { field });
  }
  return Object.freeze([...result]) as CameraEase;
}

function cameraPath(value: CameraPath | undefined, field: string): CameraPath {
  if (value === undefined || value.kind === "linear") {
    return Object.freeze({ kind: "linear" });
  }
  if (value.kind === "bezier") {
    return Object.freeze({
      kind: "bezier",
      control1: point(value.control1, `${field}.control1`),
      control2: point(value.control2, `${field}.control2`),
    });
  }
  if (value.kind === "arc") {
    const direction = value.direction ?? "shortest";
    if (!["shortest", "clockwise", "counterclockwise"].includes(direction)) {
      fail("INVALID_CAMERA", `${field}.direction 无效`, { field, direction });
    }
    const turns = value.turns ?? 0;
    if (!Number.isSafeInteger(turns) || turns < 0) {
      fail("INVALID_CAMERA", `${field}.turns 必须是非负整数`, { field, turns });
    }
    return Object.freeze({
      kind: "arc",
      center: point(value.center, `${field}.center`),
      direction,
      turns,
    });
  }
  if (value.kind === "curve") {
    if (!Array.isArray(value.points) || value.points.length === 0) {
      fail("INVALID_CAMERA", `${field}.points 至少需要一个路径点`, { field });
    }
    return Object.freeze({
      kind: "curve",
      points: Object.freeze(value.points.map((entry, index) =>
        point(entry, `${field}.points[${index}]`)
      )) as unknown as Extract<CameraPath, { kind: "curve" }>["points"],
    }) as CameraPath;
  }
  if (value.kind === "custom") {
    if (typeof value.sample !== "function") {
      fail("INVALID_CAMERA", `${field}.sample 必须是同步函数`, { field });
    }
    return Object.freeze({ kind: "custom", sample: value.sample });
  }
  fail("INVALID_CAMERA", `${field}.kind 无效`, { field });
}

function padding(value: CameraPadding | undefined, field: string): CameraPadding | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") {
    const result = finite(value, field);
    if (result < 0) fail("INVALID_CAMERA", `${field} 不能为负数`, { field, value });
    return result;
  }
  const result = {
    top: finite(value?.top, `${field}.top`),
    right: finite(value?.right, `${field}.right`),
    bottom: finite(value?.bottom, `${field}.bottom`),
    left: finite(value?.left, `${field}.left`),
  };
  if (Object.values(result).some((entry) => entry < 0)) {
    fail("INVALID_CAMERA", `${field} 不能包含负数`, { field });
  }
  return Object.freeze(result);
}

function target(value: CameraTarget, field: string): CameraTarget {
  if (typeof value !== "object" || value === null) {
    fail("INVALID_CAMERA", `${field} 必须是 Camera target`, { field });
  }
  if (value.kind === "pose") {
    const fields = ["x", "y", "zoom", "rotation", "width", "height"] as const;
    if (fields.every((name) => value[name] === undefined)) {
      fail("INVALID_CAMERA", `${field} pose 至少需要一个属性`, { field });
    }
    const resolved: Record<string, number | "pose"> = { kind: "pose" };
    for (const name of fields) {
      if (value[name] === undefined) continue;
      resolved[name] = name === "zoom" || name === "width" || name === "height"
        ? positive(value[name], `${field}.${name}`)
        : finite(value[name], `${field}.${name}`);
    }
    return Object.freeze(resolved) as unknown as CameraPoseTarget;
  }
  if (value.kind === "fit") {
    if (typeof value.target !== "string" || value.target.length === 0) {
      fail("INVALID_CAMERA", `${field}.target 必须是非空 World id`, { field });
    }
    if (!["contain", "cover", "width", "height"].includes(value.fit)) {
      fail("INVALID_CAMERA", `${field}.fit 无效`, { field, value: value.fit });
    }
    const resolvedPadding = padding(value.padding, `${field}.padding`);
    return Object.freeze({
      kind: "fit",
      target: value.target,
      fit: value.fit,
      ...(resolvedPadding === undefined ? {} : { padding: resolvedPadding }),
    });
  }
  fail("INVALID_CAMERA", `${field}.kind 必须是 pose 或 fit`, { field });
}

export function defineCamera(input: CameraDefinitionInput): CameraDefinition {
  if (typeof input !== "object" || input === null) {
    fail("INVALID_CAMERA", "defineCamera() 需要配置对象");
  }
  const initial = Object.freeze({
    x: finite(input.initial?.x ?? 0, "camera.initial.x"),
    y: finite(input.initial?.y ?? 0, "camera.initial.y"),
    zoom: positive(input.initial?.zoom ?? 1, "camera.initial.zoom"),
    rotation: finite(input.initial?.rotation ?? 0, "camera.initial.rotation"),
  });
  const moves = Object.freeze((input.moves ?? []).map((move, index) => {
    if (typeof move !== "object" || move === null) {
      fail("INVALID_CAMERA", `camera.moves[${index}] 必须是对象`);
    }
    return Object.freeze({
      at: timeExpression(move.at, `camera.moves[${index}].at`),
      duration: timeExpression(move.duration, `camera.moves[${index}].duration`),
      to: target(move.to, `camera.moves[${index}].to`),
      path: cameraPath(move.path, `camera.moves[${index}].path`),
      ease: cameraEase(move.ease, `camera.moves[${index}].ease`),
    });
  }));
  return Object.freeze({
    width: positive(input.width, "camera.width"),
    height: positive(input.height, "camera.height"),
    initial,
    moves,
    [CAMERA_DEFINITION]: true as const,
  });
}

export function isCameraDefinition(value: unknown): value is CameraDefinition {
  return typeof value === "object" && value !== null &&
    (value as Record<PropertyKey, unknown>)[CAMERA_DEFINITION] === true;
}

export function defineCameraProgram(input: CameraProgramInput): CameraProgramDefinition {
  if (typeof input !== "object" || input === null || typeof input.cameras !== "object" || input.cameras === null) {
    fail("INVALID_CAMERA_PROGRAM", "defineCameraProgram() 需要 cameras 对象");
  }
  const entries = Object.entries(input.cameras);
  if (entries.length === 0) {
    fail("INVALID_CAMERA_PROGRAM", "Camera Program 至少需要一个 Camera");
  }
  const cameras: Record<string, CameraDefinition> = {};
  for (const [id, camera] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
      fail("INVALID_CAMERA_PROGRAM", `Camera id "${id}" 无效`, { id });
    }
    if (!isCameraDefinition(camera)) {
      fail("INVALID_CAMERA_PROGRAM", `Camera "${id}" 必须由 defineCamera() 创建`, { id });
    }
    cameras[id] = camera;
  }
  if (typeof input.initialCamera !== "string" || cameras[input.initialCamera] === undefined) {
    fail("INVALID_CAMERA_PROGRAM", "initialCamera 必须引用已声明 Camera", {
      initialCamera: input.initialCamera,
    });
  }
  const cuts = Object.freeze((input.cuts ?? []).map((cut, index) => {
    if (typeof cut !== "object" || cut === null) {
      fail("INVALID_CAMERA_PROGRAM", `camera.cuts[${index}] 必须是对象`);
    }
    if (typeof cut.to !== "string" || cameras[cut.to] === undefined) {
      fail("INVALID_CAMERA_PROGRAM", `camera.cuts[${index}].to 必须引用已声明 Camera`, {
        index,
        to: cut.to,
      });
    }
    return Object.freeze({
      at: timeExpression(cut.at, `camera.cuts[${index}].at`),
      to: cut.to,
    });
  }));
  return Object.freeze({
    cameras: Object.freeze(cameras),
    initialCamera: input.initialCamera,
    cuts,
    [CAMERA_PROGRAM_DEFINITION]: true as const,
  });
}

export function isCameraProgramDefinition(value: unknown): value is CameraProgramDefinition {
  return typeof value === "object" && value !== null &&
    (value as Record<PropertyKey, unknown>)[CAMERA_PROGRAM_DEFINITION] === true;
}

export function isCameraSource(value: unknown): value is CameraSource {
  return isCameraDefinition(value) || isCameraProgramDefinition(value);
}

export function initialCamera(camera: CameraSource): CameraDefinition {
  return isCameraDefinition(camera) ? camera : camera.cameras[camera.initialCamera]!;
}

export function resolveTimeFrames(value: TimeExpression, fps: number, field: string): number {
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
    fail("INVALID_CAMERA_TIME", `${field} 超出可用帧范围`, { field, value });
  }
  return rounded;
}

function aspectMatches(width: number, height: number, viewportWidth: number, viewportHeight: number): boolean {
  return Math.abs(width / height - viewportWidth / viewportHeight) <= ASPECT_EPSILON;
}

function assertCameraAspect(pose: CameraPose, viewportWidth: number, viewportHeight: number): void {
  if (!aspectMatches(pose.width, pose.height, viewportWidth, viewportHeight)) {
    fail(
      "CAMERA_ASPECT_MISMATCH",
      `Camera ${pose.width}×${pose.height} 与 viewport ${viewportWidth}×${viewportHeight} 宽高比不一致`,
      { camera: { width: pose.width, height: pose.height }, viewport: { width: viewportWidth, height: viewportHeight } },
    );
  }
}

export function worldPolygon(input: {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly anchor: WorldAnchor;
  readonly rotation: number;
  readonly scale: number;
}): readonly [WorldPoint, WorldPoint, WorldPoint, WorldPoint] {
  const radians = input.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const left = -input.anchor.x * input.width;
  const top = -input.anchor.y * input.height;
  const right = left + input.width;
  const bottom = top + input.height;
  const transform = (x: number, y: number): Readonly<WorldPoint> => {
    const scaledX = x * input.scale;
    const scaledY = y * input.scale;
    return Object.freeze({
      x: input.x + scaledX * cosine - scaledY * sine,
      y: input.y + scaledX * sine + scaledY * cosine,
    });
  };
  return Object.freeze([
    transform(left, top),
    transform(right, top),
    transform(right, bottom),
    transform(left, bottom),
  ]);
}

function rotate(input: WorldPoint, degrees: number): WorldPoint {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: input.x * cosine - input.y * sine,
    y: input.x * sine + input.y * cosine,
  };
}

function normalizedPadding(value: CameraPadding | undefined): CameraInsets {
  if (value === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof value === "number") return { top: value, right: value, bottom: value, left: value };
  return value;
}

function fitPose(start: CameraPose, target: CameraFitTarget, bounds: WorldBounds): CameraPose {
  const oriented = bounds.polygon.map((entry) => rotate(entry, -start.rotation));
  const xs = oriented.map((entry) => entry.x);
  const ys = oriented.map((entry) => entry.y);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumY = Math.min(...ys);
  const maximumY = Math.max(...ys);
  const targetWidth = maximumX - minimumX;
  const targetHeight = maximumY - minimumY;
  const insets = normalizedPadding(target.padding);
  const availableWidth = start.width - insets.left - insets.right;
  const availableHeight = start.height - insets.top - insets.bottom;
  if (availableWidth <= 0 || availableHeight <= 0) {
    fail("INVALID_CAMERA", "Camera Fit padding 必须小于 Camera 尺寸", {
      target: target.target,
      padding: insets,
    });
  }
  const widthZoom = availableWidth / targetWidth;
  const heightZoom = availableHeight / targetHeight;
  const zoom = target.fit === "contain" ? Math.min(widthZoom, heightZoom)
    : target.fit === "cover" ? Math.max(widthZoom, heightZoom)
    : target.fit === "width" ? widthZoom
    : heightZoom;
  const targetCenter = {
    x: (minimumX + maximumX) / 2,
    y: (minimumY + maximumY) / 2,
  };
  const desiredScreenCenter = {
    x: (insets.left - insets.right) / 2,
    y: (insets.top - insets.bottom) / 2,
  };
  const orientedCamera = {
    x: targetCenter.x - desiredScreenCenter.x / zoom,
    y: targetCenter.y - desiredScreenCenter.y / zoom,
  };
  const cameraPosition = rotate(orientedCamera, start.rotation);
  return Object.freeze({ ...start, x: cameraPosition.x, y: cameraPosition.y, zoom });
}

function resolveTarget(start: CameraPose, value: CameraTarget, worlds: ReadonlyMap<string, WorldBounds>): CameraPose {
  if (value.kind === "pose") {
    return Object.freeze({
      x: value.x ?? start.x,
      y: value.y ?? start.y,
      zoom: value.zoom ?? start.zoom,
      rotation: value.rotation ?? start.rotation,
      width: value.width ?? start.width,
      height: value.height ?? start.height,
    });
  }
  const bounds = worlds.get(value.target);
  if (bounds === undefined) {
    fail("CAMERA_TARGET_NOT_FOUND", `Camera Fit 找不到 World "${value.target}"`, { target: value.target });
  }
  return fitPose(start, value, bounds);
}

function cubicCoordinate(start: number, first: number, second: number, end: number, progress: number): number {
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

function ease(progress: number, value: CameraEase): number {
  const curves: Record<Exclude<CameraEase, readonly number[]>, readonly [number, number, number, number]> = {
    linear: [0, 0, 1, 1],
    ease: [0.25, 0.1, 0.25, 1],
    "ease-in": [0.42, 0, 1, 1],
    "ease-out": [0, 0, 0.58, 1],
    "ease-in-out": [0.42, 0, 0.58, 1],
  };
  return cubicBezier(progress, typeof value === "string" ? curves[value] : value);
}

function catmullRom(points: readonly WorldPoint[], progress: number): WorldPoint {
  const segmentCount = points.length - 1;
  const position = Math.min(segmentCount - GEOMETRY_EPSILON, progress * segmentCount);
  const index = Math.max(0, Math.floor(position));
  const local = progress >= 1 ? 1 : position - index;
  const p1 = points[index]!;
  const p2 = points[Math.min(points.length - 1, index + 1)]!;
  const p0 = points[Math.max(0, index - 1)]!;
  const p3 = points[Math.min(points.length - 1, index + 2)]!;
  const coordinate = (a: number, b: number, c: number, d: number) =>
    0.5 * ((2 * b) + (-a + c) * local +
      (2 * a - 5 * b + 4 * c - d) * local ** 2 +
      (-a + 3 * b - 3 * c + d) * local ** 3);
  return { x: coordinate(p0.x, p1.x, p2.x, p3.x), y: coordinate(p0.y, p1.y, p2.y, p3.y) };
}

function arcPoint(start: WorldPoint, end: WorldPoint, path: Extract<CameraPath, { kind: "arc" }>, progress: number): WorldPoint {
  const startVector = { x: start.x - path.center.x, y: start.y - path.center.y };
  const endVector = { x: end.x - path.center.x, y: end.y - path.center.y };
  const startAngle = Math.atan2(startVector.y, startVector.x);
  const endAngle = Math.atan2(endVector.y, endVector.x);
  let delta = endAngle - startAngle;
  if (path.direction === "clockwise") {
    while (delta < 0) delta += Math.PI * 2;
    delta += (path.turns ?? 0) * Math.PI * 2;
  } else if (path.direction === "counterclockwise") {
    while (delta > 0) delta -= Math.PI * 2;
    delta -= (path.turns ?? 0) * Math.PI * 2;
  } else {
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    delta += Math.sign(delta || 1) * (path.turns ?? 0) * Math.PI * 2;
  }
  const radius = Math.hypot(startVector.x, startVector.y) +
    (Math.hypot(endVector.x, endVector.y) - Math.hypot(startVector.x, startVector.y)) * progress;
  const angle = startAngle + delta * progress;
  return {
    x: path.center.x + Math.cos(angle) * radius,
    y: path.center.y + Math.sin(angle) * radius,
  };
}

function pathPosition(start: CameraPose, end: CameraPose, path: CameraPath, progress: number): WorldPoint {
  if (path.kind === "linear") {
    return {
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    };
  }
  if (path.kind === "bezier") {
    return {
      x: cubicCoordinate(start.x, path.control1.x, path.control2.x, end.x, progress),
      y: cubicCoordinate(start.y, path.control1.y, path.control2.y, end.y, progress),
    };
  }
  if (path.kind === "arc") return arcPoint(start, end, path, progress);
  if (path.kind === "curve") {
    return catmullRom([{ x: start.x, y: start.y }, ...path.points, { x: end.x, y: end.y }], progress);
  }
  const context = Object.freeze({
    start: Object.freeze({ x: start.x, y: start.y }),
    end: Object.freeze({ x: end.x, y: end.y }),
  });
  const first = point(path.sample(progress, context), "camera custom path result");
  const second = point(path.sample(progress, context), "camera custom path result");
  if (first.x !== second.x || first.y !== second.y) {
    fail("NON_DETERMINISTIC_CAMERA_PATH", "Camera custom path 对相同输入返回了不同结果", {
      progress,
      first,
      second,
    });
  }
  return first;
}

function interpolate(start: CameraPose, end: CameraPose, path: CameraPath, progress: number): CameraPose {
  const lerp = (left: number, right: number) => left + (right - left) * progress;
  const position = pathPosition(start, end, path, progress);
  return Object.freeze({
    ...position,
    zoom: lerp(start.zoom, end.zoom),
    rotation: lerp(start.rotation, end.rotation),
    width: lerp(start.width, end.width),
    height: lerp(start.height, end.height),
  });
}

export function cameraMatrix(pose: CameraPose, viewportWidth: number, viewportHeight: number): string {
  const scale = viewportWidth / pose.width * pose.zoom;
  const radians = -pose.rotation * Math.PI / 180;
  const a = scale * Math.cos(radians);
  const b = scale * Math.sin(radians);
  const c = -scale * Math.sin(radians);
  const d = scale * Math.cos(radians);
  const e = viewportWidth / 2 - a * pose.x - c * pose.y;
  const f = viewportHeight / 2 - b * pose.x - d * pose.y;
  return `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
}

export function projectWorldPoint(
  input: WorldPoint,
  pose: CameraPose,
  viewportWidth: number,
  viewportHeight: number,
): WorldPoint {
  const relative = rotate({ x: input.x - pose.x, y: input.y - pose.y }, -pose.rotation);
  const scale = viewportWidth / pose.width * pose.zoom;
  return {
    x: viewportWidth / 2 + relative.x * scale,
    y: viewportHeight / 2 + relative.y * scale,
  };
}

export function unprojectViewportPoint(
  input: WorldPoint,
  pose: CameraPose,
  viewportWidth: number,
  viewportHeight: number,
): WorldPoint {
  const scale = viewportWidth / pose.width * pose.zoom;
  const relative = rotate({
    x: (input.x - viewportWidth / 2) / scale,
    y: (input.y - viewportHeight / 2) / scale,
  }, pose.rotation);
  return { x: pose.x + relative.x, y: pose.y + relative.y };
}

interface ResolvedMove {
  readonly startFrame: number;
  readonly endFrame: number;
  readonly start: CameraPose;
  readonly end: CameraPose;
  readonly path: CameraPath;
  readonly ease: CameraEase;
}

export function resolveUniverseFrames(input: {
  readonly camera: CameraDefinition;
  readonly worlds: ReadonlyMap<string, WorldBounds>;
  readonly fps: number;
  readonly durationInFrames: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}): readonly UniverseFrame[] {
  const { camera, worlds, fps, durationInFrames, viewportWidth, viewportHeight } = input;
  if (!Number.isSafeInteger(durationInFrames) || durationInFrames <= 0) {
    fail("INVALID_CAMERA", "composition.durationInFrames 必须是正整数");
  }
  const initial: CameraPose = Object.freeze({ ...camera.initial, width: camera.width, height: camera.height });
  assertCameraAspect(initial, viewportWidth, viewportHeight);
  let previousEnd = 0;
  let cursor = initial;
  const moves: ResolvedMove[] = camera.moves.map((move, index) => {
    const startFrame = resolveTimeFrames(move.at, fps, `camera.moves[${index}].at`);
    const durationFrames = resolveTimeFrames(move.duration, fps, `camera.moves[${index}].duration`);
    if (durationFrames <= 0) {
      fail("INVALID_CAMERA_TIME", `camera.moves[${index}].duration 必须至少为 1 frame`, { index });
    }
    const endFrame = startFrame + durationFrames;
    if (startFrame < previousEnd) {
      fail("CAMERA_MOVE_OVERLAP", `camera.moves[${index}] 与前一个 Move 重叠`, { index });
    }
    if (endFrame > durationInFrames) {
      fail("CAMERA_MOVE_OUT_OF_RANGE", `camera.moves[${index}] 超出 artifact duration`, {
        index,
        endFrame,
        durationInFrames,
      });
    }
    const end = resolveTarget(cursor, move.to, worlds);
    assertCameraAspect(end, viewportWidth, viewportHeight);
    const resolved = Object.freeze({
      startFrame,
      endFrame,
      start: cursor,
      end,
      path: move.path ?? { kind: "linear" as const },
      ease: move.ease ?? "linear",
    });
    previousEnd = endFrame;
    cursor = end;
    return resolved;
  });
  const frames: UniverseFrame[] = [];
  for (let frame = 0; frame <= durationInFrames; frame += 1) {
    let pose = initial;
    for (const move of moves) {
      if (frame < move.startFrame) break;
      if (frame >= move.endFrame) {
        pose = move.end;
        continue;
      }
      const progress = ease(
        (frame - move.startFrame) / (move.endFrame - move.startFrame),
        move.ease,
      );
      pose = interpolate(move.start, move.end, move.path, progress);
      break;
    }
    frames.push(Object.freeze({
      frame,
      pose,
      matrix: cameraMatrix(pose, viewportWidth, viewportHeight),
    }));
  }
  return Object.freeze(frames);
}

export function resolveUniverseSourceFrames(input: {
  readonly camera: CameraSource;
  readonly worlds: ReadonlyMap<string, WorldBounds>;
  readonly fps: number;
  readonly durationInFrames: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}): readonly UniverseFrame[] {
  if (isCameraDefinition(input.camera)) return resolveUniverseFrames({ ...input, camera: input.camera });
  const program = input.camera;
  const cameraFrames = new Map(Object.entries(program.cameras).map(([id, camera]) => [
    id,
    resolveUniverseFrames({ ...input, camera }),
  ]));
  let previousCut = -1;
  const cuts = program.cuts.map((cut, index) => {
    const frame = resolveTimeFrames(cut.at, input.fps, `camera.cuts[${index}].at`);
    if (frame <= previousCut) {
      fail("INVALID_CAMERA_PROGRAM", "Camera Cut 必须按时间严格递增且不能同帧重复", { index, frame });
    }
    if (frame < 0 || frame > input.durationInFrames) {
      fail("CAMERA_CUT_OUT_OF_RANGE", `camera.cuts[${index}] 超出 artifact duration`, {
        index,
        frame,
        durationInFrames: input.durationInFrames,
      });
    }
    previousCut = frame;
    return { frame, to: cut.to };
  });
  let active = program.initialCamera;
  let cutIndex = 0;
  const frames: UniverseFrame[] = [];
  for (let frame = 0; frame <= input.durationInFrames; frame += 1) {
    let cut = false;
    while (cuts[cutIndex] !== undefined && cuts[cutIndex]!.frame <= frame) {
      active = cuts[cutIndex]!.to;
      cutIndex += 1;
      cut = true;
    }
    const selected = cameraFrames.get(active)?.[frame];
    if (selected === undefined) {
      fail("INVALID_CAMERA_PROGRAM", `Camera "${active}" 缺少 frame ${frame}`, { active, frame });
    }
    frames.push(cut ? Object.freeze({ ...selected, cut: true as const }) : selected);
  }
  return Object.freeze(frames);
}

function frustum(pose: CameraPose, overscan: number): readonly WorldPoint[] {
  const width = pose.width / pose.zoom * (1 + 2 * overscan);
  const height = pose.height / pose.zoom * (1 + 2 * overscan);
  return [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ].map((entry) => {
    const rotated = rotate(entry, pose.rotation);
    return { x: pose.x + rotated.x, y: pose.y + rotated.y };
  });
}

function projectionsOverlap(left: readonly WorldPoint[], right: readonly WorldPoint[], axis: WorldPoint): boolean {
  const project = (polygon: readonly WorldPoint[]) => {
    const values = polygon.map((entry) => entry.x * axis.x + entry.y * axis.y);
    return { minimum: Math.min(...values), maximum: Math.max(...values) };
  };
  const a = project(left);
  const b = project(right);
  return a.maximum + GEOMETRY_EPSILON >= b.minimum && b.maximum + GEOMETRY_EPSILON >= a.minimum;
}

function polygonsIntersect(left: readonly WorldPoint[], right: readonly WorldPoint[]): boolean {
  const axes: WorldPoint[] = [];
  for (const polygon of [left, right]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index]!;
      const next = polygon[(index + 1) % polygon.length]!;
      axes.push({ x: -(next.y - current.y), y: next.x - current.x });
    }
  }
  return axes.every((axis) => projectionsOverlap(left, right, axis));
}

export function classifyWorldVisibility(
  bounds: WorldBounds,
  pose: CameraPose,
  overscan: number,
): WorldVisibility {
  if (bounds.cull === "never") return "visible";
  if (polygonsIntersect(bounds.polygon, frustum(pose, 0))) return "visible";
  if (overscan > 0 && polygonsIntersect(bounds.polygon, frustum(pose, overscan))) {
    return "near-visible";
  }
  return "invisible";
}
