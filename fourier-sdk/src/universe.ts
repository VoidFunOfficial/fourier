import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { SdkError } from "./errors.ts";
import { useFourierContext, useFourierTimeline } from "./runtime.ts";
import {
  cameraMatrix,
  classifyWorldVisibility,
  defineCamera,
  defineCameraProgram,
  initialCamera,
  isCameraSource,
  resolveUniverseSourceFrames,
  worldPolygon,
  type CameraSource,
  type WorldAnchor,
  type WorldBounds,
} from "./universe-core.ts";

export { defineCamera, defineCameraProgram };
export type {
  CameraCut,
  CameraDefinition,
  CameraDefinitionInput,
  CameraEase,
  CameraFitMode,
  CameraFitTarget,
  CameraInitial,
  CameraInsets,
  CameraMove,
  CameraPadding,
  CameraPath,
  CameraPathSampleContext,
  CameraProgramDefinition,
  CameraProgramInput,
  CameraPoseTarget,
  CameraSource,
  CameraTarget,
  WorldAnchor,
  WorldPoint,
} from "./universe-core.ts";

interface UniverseRegistry {
  register(bounds: WorldBounds): () => void;
}

const UniverseContext = createContext<UniverseRegistry | undefined>(undefined);

export interface UniverseProps {
  readonly camera: CameraSource;
  /** Fraction of the camera viewport kept near-visible on every side. */
  readonly overscan?: number;
  readonly children?: ReactNode;
}

export interface WorldProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly anchor?: WorldAnchor;
  readonly rotation?: number;
  readonly scale?: number;
  readonly zIndex?: number;
  readonly cull?: "auto" | "never";
  readonly children?: ReactNode;
}

function invalidWorld(field: string, value: unknown, positive = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || (positive && value <= 0)) {
    throw new SdkError(
      "INVALID_WORLD_TRANSFORM",
      `${field} 必须是${positive ? "正" : ""}有限数`,
      { field, value },
    );
  }
  return value;
}

function normalizedAnchor(value: WorldAnchor | undefined): Readonly<WorldAnchor> {
  const result = value ?? { x: 0.5, y: 0.5 };
  const x = invalidWorld("World.anchor.x", result.x);
  const y = invalidWorld("World.anchor.y", result.y);
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    throw new SdkError(
      "INVALID_WORLD_TRANSFORM",
      "World.anchor 必须位于 0—1",
      { anchor: { x, y } },
    );
  }
  return Object.freeze({ x, y });
}

function allEqual(values: readonly string[]): boolean {
  return values.every((value) => value === values[0]);
}

/**
 * Infinite logical 2D viewport. Children render normally; the SDK only adds
 * the common camera projection and host-controlled visibility animations.
 */
export function Universe(props: UniverseProps): ReactElement {
  if (!isCameraSource(props.camera)) {
    throw new SdkError(
      "INVALID_CAMERA",
      "Universe.camera 必须由 defineCamera() 或 defineCameraProgram() 创建",
    );
  }
  const overscan = props.overscan ?? 0.25;
  if (!Number.isFinite(overscan) || overscan < 0) {
    throw new SdkError("INVALID_CAMERA", "Universe.overscan 必须是有限非负数", { overscan });
  }
  const composition = useFourierContext();
  const timeline = useFourierTimeline();
  const viewport = useRef<HTMLDivElement | null>(null);
  const plane = useRef<HTMLDivElement | null>(null);
  const worlds = useRef(new Map<string, WorldBounds>());
  const registry = useMemo<UniverseRegistry>(() => Object.freeze({
    register(bounds: WorldBounds) {
      if (worlds.current.has(bounds.id)) {
        throw new SdkError(
          "DUPLICATE_WORLD_ID",
          `同一 Universe 中的 World id "${bounds.id}" 重复`,
          { id: bounds.id },
        );
      }
      worlds.current.set(bounds.id, bounds);
      return () => {
        if (worlds.current.get(bounds.id) === bounds) worlds.current.delete(bounds.id);
      };
    },
  }), []);
  const initialPose = useMemo(() => {
    const camera = initialCamera(props.camera);
    return Object.freeze({
      ...camera.initial,
      width: camera.width,
      height: camera.height,
    });
  }, [props.camera]);
  const initialMatrix = cameraMatrix(
    initialPose,
    composition.width,
    composition.height,
  );

  useLayoutEffect(() => {
    if (viewport.current === null || plane.current === null) {
      throw new SdkError("UNIVERSE_PLANE_MISSING", "Universe viewport/world plane 未挂载");
    }
    const viewportWidth = viewport.current.clientWidth;
    const viewportHeight = viewport.current.clientHeight;
    if (viewportWidth <= 0 || viewportHeight <= 0) {
      throw new SdkError(
        "UNIVERSE_VIEWPORT_INVALID",
        "Universe 必须放在具有正尺寸的布局容器内",
        { width: viewportWidth, height: viewportHeight },
      );
    }
    const frames = resolveUniverseSourceFrames({
      camera: props.camera,
      worlds: worlds.current,
      fps: composition.fps,
      durationInFrames: composition.durationInFrames,
      viewportWidth,
      viewportHeight,
    });
    const transforms = frames.map((frame) => frame.matrix);
    if (allEqual(transforms)) {
      plane.current.style.transform = transforms[0]!;
    } else {
      timeline.animate(
        plane.current,
        frames.flatMap((frame, index) => {
          const current = {
            offset: frame.frame / composition.durationInFrames,
            transform: frame.matrix,
            easing: "linear",
          };
          if (frame.cut !== true || index === 0) return [current];
          return [{ ...current, transform: frames[index - 1]!.matrix }, current];
        }),
        {
          duration: composition.durationMilliseconds,
          easing: "linear",
          fill: "both",
        },
      );
    }

    for (const bounds of worlds.current.values()) {
      if (bounds.cull === "never") continue;
      const visibility = frames.map((frame) =>
        classifyWorldVisibility(bounds, frame.pose, overscan) === "invisible"
          ? "hidden"
          : "visible"
      );
      if (allEqual(visibility)) {
        bounds.element.style.visibility = visibility[0]!;
        continue;
      }
      timeline.animate(
        bounds.element,
        frames.map((frame, index) => ({
          offset: frame.frame / composition.durationInFrames,
          visibility: visibility[index],
          easing: "steps(1, end)",
        })),
        {
          duration: composition.durationMilliseconds,
          easing: "linear",
          fill: "both",
        },
      );
    }
  }, [composition, overscan, props.camera, timeline]);

  return React.createElement("div", {
    ref: viewport,
    "data-fourier-universe": "",
    style: {
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
    },
    children: React.createElement(
      UniverseContext.Provider,
      { value: registry },
      React.createElement("div", {
        ref: plane,
        "data-fourier-world-plane": "",
        style: {
          position: "absolute",
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          overflow: "visible",
          transformOrigin: "0 0",
          transform: initialMatrix,
        },
        children: props.children,
      }),
    ),
  });
}

/** Wraps an already-rendered React subtree in one stable world transform. */
export function World(props: WorldProps): ReactElement {
  const registry = useContext(UniverseContext);
  if (registry === undefined) {
    throw new SdkError("UNIVERSE_REQUIRED", "World 只能在 Universe 内使用");
  }
  if (typeof props.id !== "string" || props.id.length === 0) {
    throw new SdkError("INVALID_WORLD_TRANSFORM", "World.id 必须是非空字符串");
  }
  const x = invalidWorld("World.x", props.x);
  const y = invalidWorld("World.y", props.y);
  const width = invalidWorld("World.width", props.width, true);
  const height = invalidWorld("World.height", props.height, true);
  const rotation = invalidWorld("World.rotation", props.rotation ?? 0);
  const scale = invalidWorld("World.scale", props.scale ?? 1, true);
  const zIndex = invalidWorld("World.zIndex", props.zIndex ?? 0);
  const anchor = normalizedAnchor(props.anchor);
  const cull = props.cull ?? "auto";
  if (cull !== "auto" && cull !== "never") {
    throw new SdkError("INVALID_WORLD_TRANSFORM", "World.cull 必须是 auto 或 never");
  }
  const element = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (element.current === null) {
      throw new SdkError("WORLD_ELEMENT_MISSING", `World "${props.id}" 未挂载`);
    }
    return registry.register(Object.freeze({
      id: props.id,
      polygon: worldPolygon({ id: props.id, x, y, width, height, anchor, rotation, scale }),
      cull,
      element: element.current,
    }));
  }, [anchor, cull, height, props.id, registry, rotation, scale, width, x, y]);

  const transform = rotation === 0 && scale === 1
    ? undefined
    : `rotate(${rotation}deg) scale(${scale})`;
  return React.createElement("div", {
    ref: element,
    "data-fourier-world": props.id,
    "data-fourier-cull": cull,
    style: {
      position: "absolute",
      left: x - anchor.x * width,
      top: y - anchor.y * height,
      width,
      height,
      zIndex,
      transformOrigin: `${anchor.x * 100}% ${anchor.y * 100}%`,
      ...(transform === undefined ? {} : { transform }),
    },
    children: props.children,
  });
}
