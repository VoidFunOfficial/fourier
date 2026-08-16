import {
  FourierMotion,
  cloneElement,
  defineMotion,
  defineSchema,
  field,
  isValidElement,
  motion,
  useFourierContext,
  useFourierRenderDriver,
  useMemo,
  useRef,
  type CSSProperties,
  type FourierMotionTarget,
  type FourierRenderDriver,
  type InferFields,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "@fourier-video/sdk/motion";
import humanImageUrl from "../placeholder/pic/human.png";
import { traceAlphaOutline } from "./OutlineDraw.tsx";

const outlineLightDirections = ["clockwise", "counterclockwise"] as const;

export const outlineLightSchema = defineSchema({
  outlineSource: field.asset({
    label: "轮廓蒙版",
    description:
      "可选透明背景图片。直接传入 img subject 时留空即可；复杂 subject 可用此图片提供 alpha 外围。",
    accept: ["image/png", "image/webp"],
    default: "",
  }),
  strokeWidth: field.number({
    label: "光条粗细",
    min: 1,
    max: 120,
    default: 16,
  }),
  lightLength: field.number({
    label: "光条长度",
    description: "光条占主体轮廓周长的百分比。",
    min: 2,
    max: 80,
    default: 8,
  }),
  color: field.color({ label: "光条颜色", default: "#4de8ff" }),
  startOffset: field.number({
    label: "起点位置",
    description: "沿主体外围的周长百分比。0 是自动提取路径的起点，50 是半圈处。",
    min: 0,
    max: 100,
    default: 0,
  }),
  direction: field.enum(outlineLightDirections, {
    label: "移动方向",
    default: "clockwise",
  }),
  rotations: field.number({
    label: "绕行圈数",
    description: "在整个 Motion 时长内沿轮廓绕行的完整圈数。",
    min: 1,
    max: 8,
    integer: true,
    default: 1,
  }),
  outlineGap: field.number({
    label: "轮廓外扩",
    description: "光条中心与原始 alpha 边缘之间的像素距离。",
    min: 0,
    max: 48,
    default: 7,
  }),
  alphaThreshold: field.number({
    label: "透明度阈值",
    min: 1,
    max: 254,
    integer: true,
    default: 8,
  }),
  smoothing: field.number({
    label: "轮廓平滑",
    description: "简化 alpha 像素边缘的像素容差；越高越平滑，细节越少。",
    min: 0,
    max: 20,
    default: 2.5,
  }),
  sampleResolution: field.number({
    label: "采样精度",
    description: "alpha 采样画布的最长边，越高越贴合细节。",
    min: 128,
    max: 1024,
    integer: true,
    default: 720,
  }),
  fit: field.enum(["contain", "cover", "fill"] as const, {
    label: "图片适配",
    default: "contain",
  }),
  contentScale: field.number({
    label: "主体缩放",
    min: 0.1,
    max: 2,
    default: 0.86,
  }),
  positionX: field.number({
    label: "主体横向位置",
    min: -500,
    max: 500,
    default: 0,
  }),
  positionY: field.number({
    label: "主体纵向位置",
    min: -500,
    max: 500,
    default: 0,
  }),
  opacity: field.number({
    label: "光条透明度",
    min: 0,
    max: 1,
    default: 1,
  }),
  glow: field.number({
    label: "发光范围",
    min: 0,
    max: 80,
    default: 28,
  }),
});

export type OutlineLightProps = InferFields<typeof outlineLightSchema>;

function normalizedStartOffset(value: number): number {
  return -(((value % 100) + 100) % 100);
}

/** Keeps one visible light strip and one gap on the normalized 100-unit path. */
export function outlineLightDasharray(lightLength: number): string {
  const length = Math.max(2, Math.min(80, lightLength));
  return `${length} ${100 - length}`;
}

/** Moves the light strip by whole turns so a looping preview has no position jump. */
export function outlineLightFrames(
  startOffset: number,
  direction: OutlineLightProps["direction"],
  rotations: number,
): readonly FourierMotionTarget[] {
  const start = normalizedStartOffset(startOffset);
  const turns = Math.max(1, Math.min(8, Math.round(rotations)));
  const distance = turns * 100 * (direction === "clockwise" ? -1 : 1);
  return [
    { strokeDashoffset: start, offset: 0 },
    { strokeDashoffset: start + distance, offset: 1 },
  ];
}

function imagePlacement(
  imageWidth: number,
  imageHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  outputWidth: number,
  outputHeight: number,
  props: OutlineLightProps,
): { x: number; y: number; width: number; height: number } {
  const fitScale = props.fit === "fill"
    ? undefined
    : props.fit === "cover"
      ? Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight)
      : Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const fittedWidth = fitScale === undefined ? canvasWidth : imageWidth * fitScale;
  const fittedHeight = fitScale === undefined ? canvasHeight : imageHeight * fitScale;
  const width = fittedWidth * props.contentScale;
  const height = fittedHeight * props.contentScale;
  return {
    x: (canvasWidth - width) / 2 + props.positionX * canvasWidth / outputWidth,
    y: (canvasHeight - height) / 2 + props.positionY * canvasHeight / outputHeight,
    width,
    height,
  };
}

function useTracedOutline(
  source: string | undefined,
  props: OutlineLightProps,
  width: number,
  height: number,
  pathRef: RefObject<SVGPathElement | null>,
): void {
  const settingsRef = useRef({ source, props, width, height });
  settingsRef.current = { source, props, width, height };

  const driver = useMemo<FourierRenderDriver>(() => {
    let readyPromise: Promise<void> | undefined;
    return {
      ready() {
        if (readyPromise !== undefined) return readyPromise;
        readyPromise = (async () => {
          const settings = settingsRef.current;
          if (settings.source === undefined || settings.source === "") {
            throw new Error(
              "OutlineLight 需要直接的 <img src=...> subject，或通过 outlineSource 传入透明轮廓图",
            );
          }
          const image = new Image();
          image.src = settings.source;
          await image.decode();

          const longestEdge = Math.max(settings.width, settings.height);
          const samplingScale = Math.min(1, settings.props.sampleResolution / longestEdge);
          const sampleWidth = Math.max(2, Math.round(settings.width * samplingScale));
          const sampleHeight = Math.max(2, Math.round(settings.height * samplingScale));
          const canvas = document.createElement("canvas");
          canvas.width = sampleWidth;
          canvas.height = sampleHeight;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (context === null) throw new Error("OutlineLight 无法创建 alpha 采样 Canvas");
          context.clearRect(0, 0, sampleWidth, sampleHeight);
          const placement = imagePlacement(
            image.naturalWidth,
            image.naturalHeight,
            sampleWidth,
            sampleHeight,
            settings.width,
            settings.height,
            settings.props,
          );
          context.drawImage(
            image,
            placement.x,
            placement.y,
            placement.width,
            placement.height,
          );
          const rgba = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
          const alpha = new Uint8ClampedArray(sampleWidth * sampleHeight);
          for (let index = 0; index < alpha.length; index += 1) {
            alpha[index] = rgba[index * 4 + 3]!;
          }
          const samplePixelsPerOutputPixel = sampleWidth / settings.width;
          const path = traceAlphaOutline({
            alpha,
            width: sampleWidth,
            height: sampleHeight,
            outputWidth: settings.width,
            outputHeight: settings.height,
            threshold: settings.props.alphaThreshold,
            dilation: settings.props.outlineGap * samplePixelsPerOutputPixel,
            smoothing: settings.props.smoothing,
          });
          if (path === "") throw new Error("OutlineLight 没有在轮廓图中找到非透明像素");
          if (pathRef.current === null) throw new Error("OutlineLight 的 SVG path 尚未挂载");
          pathRef.current.setAttribute("d", path);
        })();
        return readyPromise;
      },
      render() {},
    };
  }, []);
  useFourierRenderDriver(driver);
}

function directImageSource(subject: ReactNode): string | undefined {
  if (!isValidElement<{ src?: unknown }>(subject) || subject.type !== "img") return undefined;
  return typeof subject.props.src === "string" ? subject.props.src : undefined;
}

function fittedSubject(subject: ReactNode, fit: OutlineLightProps["fit"]): ReactNode {
  if (!isValidElement<{ style?: CSSProperties }>(subject) || subject.type !== "img") {
    return subject;
  }
  return cloneElement(subject as ReactElement<{ style?: CSSProperties }>, {
    style: {
      ...subject.props.style,
      display: "block",
      width: "100%",
      height: "100%",
      objectFit: fit,
    },
  });
}

function OutlineLightLayer({
  children,
  source,
  props,
}: {
  children: ReactNode;
  source: string | undefined;
  props: OutlineLightProps;
}): ReactNode {
  const { width, height } = useFourierContext();
  const pathRef = useRef<SVGPathElement>(null);
  const dasharray = outlineLightDasharray(props.lightLength);
  const frames = outlineLightFrames(props.startOffset, props.direction, props.rotations);
  const glow = Math.max(0, props.glow);
  useTracedOutline(source, props, width, height, pathRef);

  return (
    <FourierMotion>
      <div
        data-outline-light=""
        style={{
          position: "relative",
          width,
          height,
          overflow: "hidden",
          isolation: "isolate",
        }}
      >
        <div
          data-outline-light-subject=""
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            transform: `translate(${props.positionX}px, ${props.positionY}px) scale(${props.contentScale})`,
            transformOrigin: "50% 50%",
          }}
        >
          {fittedSubject(children, props.fit)}
        </div>

        <svg
          data-outline-light-overlay=""
          aria-hidden="true"
          viewBox={`0 0 ${width} ${height}`}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          <motion.path
            ref={pathRef}
            data-outline-light-strip=""
            d="M 0 0 Z"
            pathLength={100}
            fill="none"
            stroke={props.color}
            strokeWidth={props.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dasharray}
            vectorEffect="non-scaling-stroke"
            animate={frames}
            transition={{ ease: "linear", fill: "both" }}
            style={{
              opacity: props.opacity,
              filter: glow === 0
                ? undefined
                : `drop-shadow(0 0 ${glow * 0.45}px ${props.color}) drop-shadow(0 0 ${glow}px ${props.color})`,
              mixBlendMode: "screen",
              willChange: "stroke-dashoffset",
            }}
          />
        </svg>
      </div>
    </FourierMotion>
  );
}

export const OutlineLight = defineMotion({
  name: "OutlineLight",
  schema: outlineLightSchema,
  supportsTextMotion: false,
  component({ subject, props }) {
    const source = props.outlineSource || directImageSource(subject);
    return <OutlineLightLayer source={source} props={props}>{subject}</OutlineLightLayer>;
  },
  preview() {
    return { representativeProgress: 0.58, priority: "primary" };
  },
  designPreview() {
    return {
      props: {},
      subject: (
        <img
          src={humanImageUrl}
          width={1122}
          height={1402}
          alt="Alpha outline light example"
        />
      ),
      composition: { width: 960, height: 540, durationSeconds: 3 },
      player: { background: "#050b16", loop: true },
    };
  },
});

export default OutlineLight;
