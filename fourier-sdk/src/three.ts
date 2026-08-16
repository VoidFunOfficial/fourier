import React, {
  useMemo,
  useRef,
  type CSSProperties,
  type ReactElement,
  type RefObject,
} from "react";
import {
  Camera,
  Mesh,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  TextureLoader as ThreeTextureLoader,
  Vector3,
  WebGLRenderer,
  type ColorSpace,
  type LoadingManager,
  type Texture,
  type WebGLRendererParameters,
} from "three";
import {
  useFourierContext,
  useFourierRenderDriver,
  type FourierRenderDriver,
  type FourierRenderFrame,
  type FourierRenderResult,
  type FourierProjectedVideoSurface,
} from "./runtime.ts";
import type { FourierVideoHandle } from "./types.ts";

export * from "./react.ts";
export * from "three";
export { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
export type { GLTF } from "three/addons/loaders/GLTFLoader.js";

export type FourierTextureSource =
  | string
  | URL
  | Readonly<{ src: string }>;

export interface FourierTextureLoaderOptions {
  /** Optional output color space applied after every successful decode. */
  readonly colorSpace?: ColorSpace;
  /** Optional vertical orientation applied after every successful decode. */
  readonly flipY?: boolean;
}

/** Normalizes bundled asset imports, URLs, and image-like `{ src }` values. */
export function resolveFourierTextureSource(source: FourierTextureSource): string {
  const value = typeof source === "string"
    ? source
    : source instanceof URL
      ? source.href
      : source.src;
  if (value.trim().length === 0) {
    throw new TypeError("Fourier TextureLoader 的图片地址不能为空");
  }
  return value;
}

function textureSourceLabel(source: string): string {
  if (!source.startsWith("data:")) return source;
  const separator = source.indexOf(",");
  return separator < 0 ? "data:…" : `${source.slice(0, separator)},…`;
}

function textureDecodeError(source: string, error: unknown): Error {
  const reason = error instanceof Error
    ? error.message
    : error instanceof Event
      ? error.type
      : String(error);
  return new Error(
    `Fourier TextureLoader 无法解码图片 "${textureSourceLabel(source)}": ${reason}`,
    { cause: error },
  );
}

/**
 * Fourier-aware drop-in TextureLoader.
 *
 * It accepts normal bundled asset strings, URL objects, and image-like `{ src }`
 * values, preserves Three.js loading-manager behavior, and reports useful decode
 * errors instead of the browser's opaque `[object Event]`.
 */
export class FourierTextureLoader extends ThreeTextureLoader {
  readonly options: FourierTextureLoaderOptions;

  constructor(
    manager?: LoadingManager,
    options: FourierTextureLoaderOptions = {},
  ) {
    super(manager);
    this.options = Object.freeze({ ...options });
  }

  override load(
    source: FourierTextureSource,
    onLoad?: (texture: Texture<HTMLImageElement>) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): Texture<HTMLImageElement> {
    const url = resolveFourierTextureSource(source);
    return super.load(
      url,
      (texture) => {
        if (this.options.colorSpace !== undefined) {
          texture.colorSpace = this.options.colorSpace;
        }
        if (this.options.flipY !== undefined) texture.flipY = this.options.flipY;
        onLoad?.(texture);
      },
      onProgress,
      (error) => onError?.(textureDecodeError(url, error)),
    );
  }

  override loadAsync(
    source: FourierTextureSource,
    onProgress?: (event: ProgressEvent) => void,
  ): Promise<Texture<HTMLImageElement>> {
    return new Promise((resolve, reject) => {
      this.load(source, resolve, onProgress, reject);
    });
  }

  loadManyAsync(
    sources: readonly FourierTextureSource[],
    onProgress?: (event: ProgressEvent) => void,
  ): Promise<readonly Texture<HTMLImageElement>[]> {
    return Promise.all(sources.map((source) => this.loadAsync(source, onProgress)));
  }
}

/** The SDK Three.js entry replaces Three's loader with the Fourier-aware loader. */
export { FourierTextureLoader as TextureLoader };

export interface FourierThreeContext {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: Camera;
  readonly width: number;
  readonly height: number;
}

export interface FourierThreeFrame extends FourierThreeContext, FourierRenderFrame {}

export type FourierThreeCleanup = () => void;

export interface FourierVideoSurfaceBinding {
  readonly video: Readonly<FourierVideoHandle>;
  readonly meshRef: RefObject<Mesh | null>;
  /** Rounded-corner radius divided by the shorter video edge. */
  readonly cornerRadiusRatio?: number;
}

export interface FourierCanvasProps {
  /** Defaults to a new empty Scene. */
  scene?: Scene;
  /** Defaults to a 45° PerspectiveCamera at z=5. */
  camera?: Camera;
  /** `canvas`, pixel ratio, and output size remain Fourier-owned. */
  rendererOptions?: Omit<WebGLRendererParameters, "canvas">;
  /** May asynchronously load local assets bundled with the artifact. */
  onCreate?(
    context: Readonly<FourierThreeContext>,
  ): void | FourierThreeCleanup | Promise<void | FourierThreeCleanup>;
  /** Runs synchronously for every absolute time selected by the Fourier host. */
  onFrame?(frame: Readonly<FourierThreeFrame>): void;
  /** Optional Three.js plane populated later by FFmpeg instead of the browser. */
  videoSurface?: FourierVideoSurfaceBinding;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

/**
 * React-owned Three.js canvas driven exclusively by Fourier's absolute clock.
 * It deliberately does not start requestAnimationFrame or a Three animation loop.
 */
export function FourierCanvas(props: FourierCanvasProps): ReactElement {
  const { width, height } = useFourierContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbacksRef = useRef({
    onCreate: props.onCreate,
    onFrame: props.onFrame,
  });
  callbacksRef.current = {
    onCreate: props.onCreate,
    onFrame: props.onFrame,
  };
  const configRef = useRef({
    camera: props.camera,
    rendererOptions: props.rendererOptions,
    scene: props.scene,
    videoSurface: props.videoSurface,
  });

  const driver = useMemo<FourierRenderDriver>(() => {
    let context: FourierThreeContext | undefined;
    let cleanup: FourierThreeCleanup | undefined;
    let readyPromise: Promise<void> | undefined;

    return {
      ready() {
        if (readyPromise !== undefined) return readyPromise;
        readyPromise = (async () => {
          const canvas = canvasRef.current;
          if (canvas === null) {
            throw new Error("FourierCanvas 在初始化时找不到 canvas");
          }
          const renderer = new WebGLRenderer({
            antialias: true,
            alpha: true,
            premultipliedAlpha: true,
            ...configRef.current.rendererOptions,
            canvas,
          });
          renderer.setPixelRatio(1);
          renderer.setSize(width, height, false);
          renderer.outputColorSpace = SRGBColorSpace;
          const scene = configRef.current.scene ?? new Scene();
          const camera = configRef.current.camera ?? new PerspectiveCamera(45, width / height, 0.1, 100);
          if (configRef.current.camera === undefined) camera.position.set(0, 0, 5);
          if (camera instanceof PerspectiveCamera) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
          }
          context = Object.freeze({ canvas, renderer, scene, camera, width, height });
          const result = await callbacksRef.current.onCreate?.(context);
          if (typeof result === "function") cleanup = result;
        })();
        return readyPromise;
      },
      render(frame): FourierRenderResult | void {
        if (context === undefined) {
          throw new Error("FourierCanvas 尚未完成异步初始化");
        }
        callbacksRef.current.onFrame?.(Object.freeze({ ...context, ...frame }));
        context.renderer.render(context.scene, context.camera);
        const binding = configRef.current.videoSurface;
        if (binding === undefined) return;
        const mesh = binding.meshRef.current;
        if (!(mesh instanceof Mesh)) {
          throw new Error("FourierCanvas videoSurface.meshRef 必须指向 Three.js Mesh");
        }
        mesh.geometry.computeBoundingBox();
        const bounds = mesh.geometry.boundingBox;
        if (bounds === null) {
          throw new Error("FourierCanvas video surface geometry 没有有效 bounding box");
        }
        context.scene.updateMatrixWorld(true);
        context.camera.updateMatrixWorld(true);
        const z = (bounds.min.z + bounds.max.z) / 2;
        const project = (x: number, y: number) => {
          const point = new Vector3(x, y, z)
            .applyMatrix4(mesh.matrixWorld)
            .project(context!.camera);
          return Object.freeze({
            x: ((point.x + 1) / 2) * context!.width,
            y: ((1 - point.y) / 2) * context!.height,
          });
        };
        return Object.freeze({
          videoSurfaces: Object.freeze([Object.freeze({
            videoId: binding.video.id,
            cornerRadiusRatio: binding.cornerRadiusRatio ?? 0,
            corners: Object.freeze([
              project(bounds.min.x, bounds.max.y),
              project(bounds.max.x, bounds.max.y),
              project(bounds.min.x, bounds.min.y),
              project(bounds.max.x, bounds.min.y),
            ]) as FourierProjectedVideoSurface["corners"],
          })]),
        });
      },
      dispose() {
        cleanup?.();
        context?.renderer.dispose();
        context?.renderer.forceContextLoss();
        context = undefined;
      },
    };
  }, [height, width]);

  useFourierRenderDriver(driver);

  return React.createElement("canvas", {
    ref: canvasRef,
    className: props.className,
    "aria-label": props.ariaLabel,
    width,
    height,
    style: {
      display: "block",
      width,
      height,
      ...props.style,
    },
  });
}
