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
  camera3DMatrix,
  camera3DPerspective,
  defineCamera3D,
  isCamera3D,
  resolveCamera3DFrames,
  world3DMatrix,
  type Camera3D,
} from "./universe-3d-core.ts";

export { defineCamera3D };
export type {
  Camera3D,
  Camera3DEase,
  Camera3DFrame,
  Camera3DInput,
  Camera3DMove,
  Camera3DPose,
  Camera3DPoseInput,
} from "./universe-3d-core.ts";

interface Universe3DRegistry {
  register(id: string): () => void;
}

const Universe3DContext = createContext<Universe3DRegistry | undefined>(undefined);

export interface Universe3DProps {
  readonly camera: Camera3D;
  readonly children?: ReactNode;
}

export interface World3DAnchor {
  readonly x: number;
  readonly y: number;
}

export interface World3DProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
  readonly scale?: number;
  readonly anchor?: World3DAnchor;
  readonly children?: ReactNode;
}

function finite(value: unknown, field: string, positive = false): number {
  if (
    typeof value !== "number" || !Number.isFinite(value) ||
    (positive && value <= 0)
  ) {
    throw new SdkError(
      "INVALID_WORLD_3D_TRANSFORM",
      `${field} 必须是${positive ? "正" : ""}有限数`,
      { field, value },
    );
  }
  return value;
}

function normalizedAnchor(value: World3DAnchor | undefined): Readonly<World3DAnchor> {
  const anchor = value ?? { x: 0.5, y: 0.5 };
  const x = finite(anchor.x, "World3D.anchor.x");
  const y = finite(anchor.y, "World3D.anchor.y");
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    throw new SdkError(
      "INVALID_WORLD_3D_TRANSFORM",
      "World3D.anchor 必须位于 0—1",
      { anchor: { x, y } },
    );
  }
  return Object.freeze({ x, y });
}

function allEqual(values: readonly string[]): boolean {
  return values.every((value) => value === values[0]);
}

/**
 * A perspective React world whose camera matrices are calculated by Three.js
 * and sampled exclusively through Fourier's absolute timeline.
 */
export function Universe3D(props: Universe3DProps): ReactElement {
  if (!isCamera3D(props.camera)) {
    throw new SdkError(
      "INVALID_CAMERA_3D",
      "Universe3D.camera 必须由 defineCamera3D() 创建",
    );
  }
  const composition = useFourierContext();
  const timeline = useFourierTimeline();
  const viewport = useRef<HTMLDivElement | null>(null);
  const plane = useRef<HTMLDivElement | null>(null);
  const worldIds = useRef(new Set<string>());
  const registry = useMemo<Universe3DRegistry>(() => Object.freeze({
    register(id: string) {
      if (worldIds.current.has(id)) {
        throw new SdkError(
          "DUPLICATE_WORLD_3D_ID",
          `同一 Universe3D 中的 World3D id "${id}" 重复`,
          { id },
        );
      }
      worldIds.current.add(id);
      return () => {
        worldIds.current.delete(id);
      };
    },
  }), []);
  const initialMatrix = useMemo(
    () => camera3DMatrix(props.camera.initial),
    [props.camera],
  );
  const perspective = useMemo(
    () => camera3DPerspective(props.camera, composition.height),
    [composition.height, props.camera],
  );

  useLayoutEffect(() => {
    if (viewport.current === null || plane.current === null) {
      throw new SdkError("UNIVERSE_3D_PLANE_MISSING", "Universe3D viewport/world plane 未挂载");
    }
    const viewportHeight = viewport.current.clientHeight;
    if (viewport.current.clientWidth <= 0 || viewportHeight <= 0) {
      throw new SdkError(
        "UNIVERSE_3D_VIEWPORT_INVALID",
        "Universe3D 必须放在具有正尺寸的布局容器内",
      );
    }
    viewport.current.style.perspective = `${camera3DPerspective(props.camera, viewportHeight)}px`;
    const frames = resolveCamera3DFrames({
      camera: props.camera,
      fps: composition.fps,
      durationInFrames: composition.durationInFrames,
    });
    const transforms = frames.map((frame) => frame.matrix);
    if (allEqual(transforms)) {
      plane.current.style.transform = transforms[0]!;
      return;
    }
    timeline.animate(
      plane.current,
      frames.map((frame) => ({
        offset: frame.frame / composition.durationInFrames,
        transform: frame.matrix,
        easing: "linear",
      })),
      {
        duration: composition.durationMilliseconds,
        easing: "linear",
        fill: "both",
      },
    );
  }, [composition, props.camera, timeline]);

  return React.createElement("div", {
    ref: viewport,
    "data-fourier-universe-3d": "",
    style: {
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      perspective,
      perspectiveOrigin: "50% 50%",
      transformStyle: "preserve-3d",
    },
    children: React.createElement(
      Universe3DContext.Provider,
      { value: registry },
      React.createElement("div", {
        ref: plane,
        "data-fourier-world-3d-plane": "",
        style: {
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 0,
          height: 0,
          overflow: "visible",
          transformOrigin: "0 0",
          transformStyle: "preserve-3d",
          transform: initialMatrix,
        },
        children: props.children,
      }),
    ),
  });
}

/** Places an existing React subtree on a fixed plane in Universe3D space. */
export function World3D(props: World3DProps): ReactElement {
  const registry = useContext(Universe3DContext);
  if (registry === undefined) {
    throw new SdkError("UNIVERSE_3D_REQUIRED", "World3D 只能在 Universe3D 内使用");
  }
  if (typeof props.id !== "string" || props.id.length === 0) {
    throw new SdkError("INVALID_WORLD_3D_TRANSFORM", "World3D.id 必须是非空字符串");
  }
  const x = finite(props.x, "World3D.x");
  const y = finite(props.y, "World3D.y");
  const z = finite(props.z, "World3D.z");
  const width = finite(props.width, "World3D.width", true);
  const height = finite(props.height, "World3D.height", true);
  const rx = finite(props.rx ?? 0, "World3D.rx");
  const ry = finite(props.ry ?? 0, "World3D.ry");
  const rz = finite(props.rz ?? 0, "World3D.rz");
  const scale = finite(props.scale ?? 1, "World3D.scale", true);
  const anchor = normalizedAnchor(props.anchor);

  useLayoutEffect(() => registry.register(props.id), [props.id, registry]);

  return React.createElement("div", {
    "data-fourier-world-3d": props.id,
    style: {
      position: "absolute",
      left: -anchor.x * width,
      top: -anchor.y * height,
      width,
      height,
      transformOrigin: `${anchor.x * 100}% ${anchor.y * 100}%`,
      transformStyle: "preserve-3d",
      backfaceVisibility: "hidden",
      transform: world3DMatrix({ x, y, z, rx, ry, rz, scale }),
    },
    children: props.children,
  });
}
