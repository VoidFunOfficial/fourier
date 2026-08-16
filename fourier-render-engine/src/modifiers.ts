import { fail } from "./errors.ts";
import type {
  BaseVisualModifier,
  ModifierPhase,
  TransformChannels,
  TransformEasing,
  TransformNode,
  VisualNode,
} from "./types.ts";

export const IDENTITY_TRANSFORM: Readonly<TransformChannels> = {
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
};

export interface ModifierSample {
  phase: ModifierPhase;
  progress: number;
  modifierFrame: number;
}

export interface VisualPlacement {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

function activeProgress(modifier: BaseVisualModifier, frame: number): number {
  if (modifier.durationFrames === 1) return 1;
  return frame / (modifier.durationFrames - 1);
}

export function sampleModifier(
  modifier: BaseVisualModifier,
  hostFrame: number,
): ModifierSample | undefined {
  if (!modifier.enabled) return undefined;
  const modifierFrame = hostFrame - modifier.localStartFrame;
  if (modifierFrame < 0) {
    if (modifier.fill !== "backwards" && modifier.fill !== "both") {
      return undefined;
    }
    return { phase: "before", progress: 0, modifierFrame };
  }
  if (hostFrame >= modifier.localEndFrame) {
    if (modifier.fill !== "forwards" && modifier.fill !== "both") {
      return undefined;
    }
    return { phase: "after", progress: 1, modifierFrame };
  }
  return {
    phase: "active",
    progress: activeProgress(modifier, modifierFrame),
    modifierFrame,
  };
}

function cubicCoordinate(
  t: number,
  first: number,
  second: number,
): number {
  const inverse = 1 - t;
  return (
    3 * inverse * inverse * t * first +
    3 * inverse * t * t * second +
    t * t * t
  );
}

function cubicDerivative(
  t: number,
  first: number,
  second: number,
): number {
  const inverse = 1 - t;
  return (
    3 * inverse * inverse * first +
    6 * inverse * t * (second - first) +
    3 * t * t * (1 - second)
  );
}

function cubicBezier(
  progress: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  let t = progress;
  for (let iteration = 0; iteration < 8; iteration++) {
    const difference = cubicCoordinate(t, x1, x2) - progress;
    if (Math.abs(difference) < 1e-7) {
      return cubicCoordinate(t, y1, y2);
    }
    const derivative = cubicDerivative(t, x1, x2);
    if (Math.abs(derivative) < 1e-7) break;
    t -= difference / derivative;
    if (t < 0 || t > 1) break;
  }
  let lower = 0;
  let upper = 1;
  t = progress;
  for (let iteration = 0; iteration < 24; iteration++) {
    const x = cubicCoordinate(t, x1, x2);
    if (Math.abs(x - progress) < 1e-7) break;
    if (x < progress) lower = t;
    else upper = t;
    t = (lower + upper) / 2;
  }
  return cubicCoordinate(t, y1, y2);
}

export function parseCubicBezier(
  easing: string,
): [number, number, number, number] | undefined {
  const match =
    /^cubic-bezier\(\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\)$/.exec(
      easing,
    );
  if (match === null) return undefined;
  const values = match.slice(1).map(Number);
  if (
    values.length !== 4 ||
    values.some((value) => !Number.isFinite(value)) ||
    (values[0] ?? -1) < 0 ||
    (values[0] ?? 2) > 1 ||
    (values[2] ?? -1) < 0 ||
    (values[2] ?? 2) > 1
  ) {
    return undefined;
  }
  return values as [number, number, number, number];
}

export function validateEasing(source: string): TransformEasing {
  const named = new Set([
    "linear",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "step-start",
    "step-end",
  ]);
  if (named.has(source) || parseCubicBezier(source) !== undefined) {
    return source as TransformEasing;
  }
  fail("INVALID_EASING", `不支持的 Transform easing: "${source}"`);
}

export function applyEasing(
  easing: TransformEasing,
  progress: number,
): number {
  const value = Math.min(1, Math.max(0, progress));
  if (easing === "linear") return value;
  if (easing === "step-start") return value <= 0 ? 0 : 1;
  if (easing === "step-end") return value >= 1 ? 1 : 0;
  if (easing === "ease-in") {
    return cubicBezier(value, 0.42, 0, 1, 1);
  }
  if (easing === "ease-out") {
    return cubicBezier(value, 0, 0, 0.58, 1);
  }
  if (easing === "ease-in-out") {
    return cubicBezier(value, 0.42, 0, 0.58, 1);
  }
  const points = parseCubicBezier(easing);
  if (points === undefined) {
    fail("INVALID_EASING", `不支持的 Transform easing: "${easing}"`);
  }
  return cubicBezier(value, ...points);
}

function interpolate(left: number, right: number, progress: number): number {
  return left + (right - left) * progress;
}

export function evaluateTransform(
  transform: TransformNode,
  hostFrame: number,
): TransformChannels {
  const sample = sampleModifier(transform, hostFrame);
  if (sample === undefined) return { ...IDENTITY_TRANSFORM };
  const progress = sample.progress;
  const exact = transform.keyframes.find(
    (keyframe) => Math.abs(keyframe.offset - progress) < 1e-9,
  );
  if (exact !== undefined) {
    const { offset: _offset, ...channels } = exact;
    return channels;
  }
  let left = transform.keyframes[0];
  let right = transform.keyframes.at(-1);
  for (let index = 0; index < transform.keyframes.length - 1; index++) {
    const candidateLeft = transform.keyframes[index];
    const candidateRight = transform.keyframes[index + 1];
    if (
      candidateLeft !== undefined &&
      candidateRight !== undefined &&
      candidateLeft.offset < progress &&
      progress < candidateRight.offset
    ) {
      left = candidateLeft;
      right = candidateRight;
      break;
    }
  }
  if (left === undefined || right === undefined) {
    fail("INVALID_TRANSFORM", `Transform "${transform.id}" 缺少 Keyframe`);
  }
  const intervalProgress =
    (progress - left.offset) / (right.offset - left.offset);
  const eased = applyEasing(transform.easing, intervalProgress);
  const channels: TransformChannels = {
    translateX: interpolate(left.translateX, right.translateX, eased),
    translateY: interpolate(left.translateY, right.translateY, eased),
    scaleX: interpolate(left.scaleX, right.scaleX, eased),
    scaleY: interpolate(left.scaleY, right.scaleY, eased),
    rotation: interpolate(left.rotation, right.rotation, eased),
    opacity: interpolate(left.opacity, right.opacity, eased),
  };
  if (Object.values(channels).some((value) => !Number.isFinite(value))) {
    fail(
      "INVALID_TRANSFORM",
      `Transform "${transform.id}" 在当前帧产生了非有限数值`,
    );
  }
  return channels;
}

export function evaluateVisualPlacement(
  node: VisualNode,
  hostFrame: number,
): VisualPlacement {
  const placement: VisualPlacement = {
    x: node.x,
    y: node.y,
    scaleX: 1,
    scaleY: 1,
    rotation: node.rotation,
    opacity: node.opacity,
  };
  for (const modifier of node.modifiers) {
    if (modifier.kind !== "transform") continue;
    const channels = evaluateTransform(modifier, hostFrame);
    placement.x += channels.translateX;
    placement.y += channels.translateY;
    placement.scaleX *= channels.scaleX;
    placement.scaleY *= channels.scaleY;
    placement.rotation += channels.rotation;
    placement.opacity *= channels.opacity;
  }
  placement.opacity = Math.min(1, Math.max(0, placement.opacity));
  if (
    Object.values(placement).some((value) => !Number.isFinite(value))
  ) {
    fail(
      "INVALID_TRANSFORM",
      `视觉宿主 "${node.id}" 的 Transform 聚合结果不是有限数值`,
    );
  }
  return placement;
}
