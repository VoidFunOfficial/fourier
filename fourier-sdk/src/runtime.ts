import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { SdkError } from "./errors.ts";
import type {
  FourierAnimationOptions,
  FourierLifecycle,
  FourierPrng,
  FourierStableContext,
  FourierTimeline,
} from "./types.ts";

interface LifecycleSlot {
  token: symbol;
  read(): FourierLifecycle;
}

export interface FourierRenderFrame {
  /** Absolute host time for this artifact sample. */
  readonly timeMilliseconds: number;
  readonly timeSeconds: number;
  /** Host-normalized progress. A zero-duration host reports 0. */
  readonly progress: number;
  readonly durationMilliseconds: number;
}

export interface FourierProjectedPoint {
  readonly x: number;
  readonly y: number;
}

export interface FourierProjectedVideoSurface {
  readonly videoId: string;
  /** Top-left, top-right, bottom-left, bottom-right in artifact pixels. */
  readonly corners: readonly [
    FourierProjectedPoint,
    FourierProjectedPoint,
    FourierProjectedPoint,
    FourierProjectedPoint,
  ];
  readonly cornerRadiusRatio: number;
}

export interface FourierRenderResult {
  readonly videoSurfaces?: readonly FourierProjectedVideoSurface[];
}

/**
 * Host-driven renderer used by non-DOM pixels such as Three.js/WebGL.
 * `ready` may load local bundled assets; `render` must stay synchronous.
 */
export interface FourierRenderDriver {
  ready(): void | Promise<void>;
  render(frame: Readonly<FourierRenderFrame>): void | FourierRenderResult;
  dispose?(): void;
}

interface RenderDriverSlot {
  token: symbol;
  driver: FourierRenderDriver;
}

export interface FourierRuntimeBindings {
  readonly stableContext: Readonly<FourierStableContext>;
  readonly hostDurationMilliseconds: number;
  registerLifecycle(token: symbol, read: () => FourierLifecycle): () => void;
  registerAnimation(animation: Animation): void;
  registerRenderDriver(token: symbol, driver: FourierRenderDriver): () => void;
}

export interface FourierRuntimeContextInput {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  /** Defaults to 60 for direct controller consumers. */
  readonly fps?: number;
  /** Derived from host duration when omitted. */
  readonly durationInFrames?: number;
}

export interface FourierRuntimeController {
  readonly bindings: FourierRuntimeBindings;
  getLifecycle(): FourierLifecycle | undefined;
  getAnimations(): readonly Animation[];
  prepareRenderDrivers(): Promise<void>;
  renderFrame(timeMilliseconds: number): FourierRenderResult;
  getRenderState(): Readonly<{
    driverCount: number;
    timeMilliseconds: number | null;
    videoSurfaces: readonly FourierProjectedVideoSurface[];
  }>;
}

function projectedSurface(
  input: FourierProjectedVideoSurface,
): FourierProjectedVideoSurface {
  if (typeof input?.videoId !== "string" || input.videoId.length === 0) {
    throw new SdkError("VIDEO_SURFACE_INVALID", "video surface 必须有非空 videoId");
  }
  if (
    !Array.isArray(input.corners) ||
    input.corners.length !== 4 ||
    input.corners.some((point) =>
      typeof point !== "object" || point === null ||
      !Number.isFinite(point.x) || !Number.isFinite(point.y)
    )
  ) {
    throw new SdkError(
      "VIDEO_SURFACE_INVALID",
      `video surface "${input.videoId}" 必须提供四个有限投影坐标`,
    );
  }
  if (
    !Number.isFinite(input.cornerRadiusRatio) ||
    input.cornerRadiusRatio < 0 ||
    input.cornerRadiusRatio > 0.5
  ) {
    throw new SdkError(
      "VIDEO_SURFACE_INVALID",
      `video surface "${input.videoId}" 的 cornerRadiusRatio 必须在 0—0.5`,
    );
  }
  const [topLeft, topRight, bottomLeft, bottomRight] = input.corners;
  const polygon = [topLeft, topRight, bottomRight, bottomLeft];
  const crosses = polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    const after = polygon[(index + 2) % polygon.length]!;
    return (next.x - point.x) * (after.y - next.y) -
      (next.y - point.y) * (after.x - next.x);
  });
  const epsilon = 1e-6;
  if (
    crosses.some((value) => Math.abs(value) <= epsilon) ||
    !(crosses.every((value) => value > 0) || crosses.every((value) => value < 0))
  ) {
    throw new SdkError(
      "VIDEO_SURFACE_INVALID",
      `video surface "${input.videoId}" 必须是非退化凸四边形`,
    );
  }
  return Object.freeze({
    videoId: input.videoId,
    cornerRadiusRatio: input.cornerRadiusRatio,
    corners: Object.freeze(input.corners.map((point) =>
      Object.freeze({ x: point.x, y: point.y })
    )) as unknown as FourierProjectedVideoSurface["corners"],
  });
}

function finite(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new SdkError(
      "INVALID_TIMELINE_ANIMATION_OPTIONS",
      `FourierTimeline ${field} 必须是有限数`,
      { field, value },
    );
  }
  return value;
}

function finiteNonNegative(value: number, field: string): number {
  const result = finite(value, field);
  if (result < 0) {
    throw new SdkError(
      "INVALID_TIMELINE_ANIMATION_OPTIONS",
      `FourierTimeline ${field} 必须是非负数`,
      { field, value },
    );
  }
  return result;
}

const animationOptionKeys = new Set([
  "duration",
  "delay",
  "iterations",
  "easing",
  "direction",
  "fill",
]);

function validateOptions(options: FourierAnimationOptions): void {
  const unsupported = Object.keys(options).filter((key) => !animationOptionKeys.has(key));
  if (unsupported.length > 0) {
    throw new SdkError(
      "UNSUPPORTED_TIMELINE_ANIMATION_OPTIONS",
      `FourierTimeline 不支持选项: ${unsupported.join(", ")}`,
      { fields: unsupported },
    );
  }
}

function validateKeyframeComposite(
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
): void {
  const values = Array.isArray(keyframes)
    ? keyframes.flatMap((frame) => frame.composite === undefined ? [] : [frame.composite])
    : keyframes.composite === undefined
      ? []
      : Array.isArray(keyframes.composite)
        ? keyframes.composite
        : [keyframes.composite];
  if (values.some((value) => value !== "replace" && value !== "auto")) {
    throw new SdkError(
      "UNSUPPORTED_TIMELINE_COMPOSITE",
      "FourierTimeline 仅支持 replace composite",
    );
  }
}

function validateKeyframeOffsets(
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
): void {
  const rawOffsets = Array.isArray(keyframes)
    ? keyframes.map((frame) => frame.offset)
    : Array.isArray(keyframes.offset)
      ? keyframes.offset
      : [keyframes.offset];
  let previous = 0;
  for (const [index, value] of rawOffsets.entries()) {
    if (value === undefined || value === null) continue;
    if (!Number.isFinite(value) || value < 0 || value > 1 || value < previous) {
      throw new SdkError(
        "INVALID_TIMELINE_KEYFRAME_OFFSETS",
        "FourierTimeline keyframe offset 必须位于 0—1 且单调不递减",
        { index, previous, value },
      );
    }
    previous = value;
  }
}

export function createFourierRuntimeController(
  stableContext: FourierRuntimeContextInput,
  hostDurationMilliseconds: number,
): FourierRuntimeController {
  finiteNonNegative(hostDurationMilliseconds, "hostDurationMilliseconds");
  const fps = stableContext.fps ?? 60;
  if (!Number.isSafeInteger(fps) || fps <= 0) {
    throw new SdkError("INVALID_RUNTIME_CONTEXT", "Fourier runtime fps 必须是正整数", {
      fps,
    });
  }
  const durationInFrames = stableContext.durationInFrames ?? Math.max(
    1,
    Math.round(hostDurationMilliseconds / 1_000 * fps),
  );
  if (!Number.isSafeInteger(durationInFrames) || durationInFrames <= 0) {
    throw new SdkError(
      "INVALID_RUNTIME_CONTEXT",
      "Fourier runtime durationInFrames 必须是正整数",
      { durationInFrames },
    );
  }
  const resolvedStableContext: FourierStableContext = Object.freeze({
    width: stableContext.width,
    height: stableContext.height,
    seed: stableContext.seed,
    fps,
    durationInFrames,
    durationMilliseconds: hostDurationMilliseconds,
  });
  let lifecycle: LifecycleSlot | undefined;
  let lifecycleRegistrationError: SdkError | undefined;
  const animations: Animation[] = [];
  const renderDrivers: RenderDriverSlot[] = [];
  let renderDriversPreparing = false;
  let renderDriversPrepared = false;
  let renderedTimeMilliseconds: number | null = null;
  let projectedVideoSurfaces: readonly FourierProjectedVideoSurface[] = Object.freeze([]);
  const bindings: FourierRuntimeBindings = Object.freeze({
    stableContext: resolvedStableContext,
    hostDurationMilliseconds,
    registerLifecycle(token: symbol, read: () => FourierLifecycle) {
      if (lifecycle !== undefined && lifecycle.token !== token) {
        lifecycleRegistrationError = new SdkError(
          "DUPLICATE_FOURIER_LIFECYCLE",
          "同一 artifact 只能注册一个 Fourier lifecycle",
        );
        throw lifecycleRegistrationError;
      }
      lifecycle = { token, read };
      return () => {
        if (lifecycle?.token === token) lifecycle = undefined;
      };
    },
    registerAnimation(animation: Animation) {
      if (animations.includes(animation)) {
        throw new SdkError(
          "DUPLICATE_FOURIER_ANIMATION",
          "同一 Animation 不能重复注册",
        );
      }
      animations.push(animation);
    },
    registerRenderDriver(token: symbol, driver: FourierRenderDriver) {
      if (renderDriversPreparing || renderDriversPrepared) {
        throw new SdkError(
          "FOURIER_RENDER_DRIVER_LATE_REGISTRATION",
          "Fourier render driver 必须在 runtime 初始化阶段注册",
        );
      }
      if (renderDrivers.some((slot) => slot.token === token || slot.driver === driver)) {
        throw new SdkError(
          "DUPLICATE_FOURIER_RENDER_DRIVER",
          "同一 Fourier render driver 不能重复注册",
        );
      }
      const slot = { token, driver };
      renderDrivers.push(slot);
      return () => {
        const index = renderDrivers.indexOf(slot);
        if (index !== -1) renderDrivers.splice(index, 1);
        driver.dispose?.();
      };
    },
  });
  return Object.freeze({
    bindings,
    getLifecycle: () => {
      if (lifecycleRegistrationError !== undefined) throw lifecycleRegistrationError;
      return lifecycle?.read();
    },
    getAnimations: () => Object.freeze([...animations]),
    prepareRenderDrivers: async () => {
      if (renderDriversPrepared) return;
      if (renderDriversPreparing) {
        throw new SdkError(
          "FOURIER_RENDER_DRIVER_PREPARE_IN_PROGRESS",
          "Fourier render driver 正在初始化",
        );
      }
      renderDriversPreparing = true;
      try {
        await Promise.all(renderDrivers.map(({ driver }) => driver.ready()));
        renderDriversPrepared = true;
      } finally {
        renderDriversPreparing = false;
      }
    },
    renderFrame: (timeMilliseconds: number) => {
      const sampleTime = finiteNonNegative(timeMilliseconds, "timeMilliseconds");
      if (!renderDriversPrepared) {
        throw new SdkError(
          "FOURIER_RENDER_DRIVER_NOT_READY",
          "Fourier render driver 必须先完成 prepareRenderDrivers()",
        );
      }
      const frame = Object.freeze({
        timeMilliseconds: sampleTime,
        timeSeconds: sampleTime / 1_000,
        progress: hostDurationMilliseconds === 0
          ? 0
          : Math.min(1, Math.max(0, sampleTime / hostDurationMilliseconds)),
        durationMilliseconds: hostDurationMilliseconds,
      });
      const surfaces: FourierProjectedVideoSurface[] = [];
      for (const { driver } of renderDrivers) {
        const result = driver.render(frame);
        if (
          result !== null &&
          (typeof result === "object" || typeof result === "function") &&
          typeof (result as { then?: unknown }).then === "function"
        ) {
          throw new SdkError(
            "FOURIER_RENDER_FRAME_ASYNC",
            "Fourier render driver.render() 必须同步返回",
          );
        }
        if (result !== undefined) {
          for (const surface of result.videoSurfaces ?? []) {
            const normalized = projectedSurface(surface);
            if (surfaces.some((entry) => entry.videoId === normalized.videoId)) {
              throw new SdkError(
                "VIDEO_SURFACE_MULTIPLE",
                `video "${normalized.videoId}" 只能绑定一个 surface`,
              );
            }
            surfaces.push(normalized);
          }
        }
      }
      renderedTimeMilliseconds = sampleTime;
      projectedVideoSurfaces = Object.freeze(surfaces);
      return Object.freeze({ videoSurfaces: projectedVideoSurfaces });
    },
    getRenderState: () => Object.freeze({
      driverCount: renderDrivers.length,
      timeMilliseconds: renderedTimeMilliseconds,
      videoSurfaces: projectedVideoSurfaces,
    }),
  });
}

const RuntimeContext = createContext<FourierRuntimeBindings | undefined>(undefined);

export function FourierRuntimeProvider(props: {
  bindings: FourierRuntimeBindings;
  children?: ReactNode;
}): React.ReactElement {
  return React.createElement(RuntimeContext.Provider, {
    value: props.bindings,
    children: props.children,
  });
}

function useRuntime(operation: string): FourierRuntimeBindings {
  const runtime = useContext(RuntimeContext);
  if (runtime === undefined) {
    throw new SdkError(
      "FOURIER_RUNTIME_REQUIRED",
      `${operation} 只能在 Fourier DOM timeline runtime 内使用`,
    );
  }
  return runtime;
}

export function useFourierLifecycle(callbacks: FourierLifecycle): void {
  const runtime = useRuntime("useFourierLifecycle()");
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const tokenRef = useRef<symbol | undefined>(undefined);
  if (tokenRef.current === undefined) tokenRef.current = Symbol("fourier-lifecycle");
  useLayoutEffect(
    () => runtime.registerLifecycle(tokenRef.current!, () => callbacksRef.current),
    [runtime],
  );
}

export function useFourierContext(): Readonly<FourierStableContext> {
  return useRuntime("useFourierContext()").stableContext;
}

export function useFourierTimeline(): FourierTimeline {
  const runtime = useRuntime("useFourierTimeline()");
  return useMemo(() => Object.freeze({
    animate(
      target: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes,
      options: FourierAnimationOptions = {},
    ): void {
      if (!(target instanceof Element)) {
        throw new SdkError(
          "INVALID_TIMELINE_ANIMATION_TARGET",
          "FourierTimeline.animate() target 必须是 Element",
        );
      }
      validateOptions(options);
      validateKeyframeComposite(keyframes);
      validateKeyframeOffsets(keyframes);
      const animation = target.animate(keyframes, {
        duration: finiteNonNegative(
          options.duration ?? runtime.hostDurationMilliseconds,
          "duration",
        ),
        delay: finite(options.delay ?? 0, "delay"),
        iterations: finiteNonNegative(options.iterations ?? 1, "iterations"),
        easing: options.easing ?? "linear",
        direction: options.direction ?? "normal",
        fill: options.fill ?? "both",
        composite: "replace",
      });
      animation.playbackRate = 1;
      animation.pause();
      runtime.registerAnimation(animation);
    },
  }), [runtime]);
}

/** Advanced host-time bridge used by SDK-owned renderers such as FourierCanvas. */
export function useFourierRenderDriver(driver: FourierRenderDriver): void {
  const runtime = useRuntime("useFourierRenderDriver()");
  const tokenRef = useRef<symbol | undefined>(undefined);
  if (tokenRef.current === undefined) tokenRef.current = Symbol("fourier-render-driver");
  useLayoutEffect(
    () => runtime.registerRenderDriver(tokenRef.current!, driver),
    [runtime, driver],
  );
}

function hashSeed(seed: number | string): number {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) {
      throw new SdkError("INVALID_PRNG_SEED", "createFourierPrng() seed 必须是有限数或字符串");
    }
    return seed >>> 0;
  }
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createFourierPrng(seed: number | string): FourierPrng {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
