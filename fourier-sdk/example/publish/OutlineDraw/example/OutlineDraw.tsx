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

export const outlineDrawSchema = defineSchema({
  outlineSource: field.asset({
    label: "轮廓蒙版",
    description:
      "可选透明背景图片。直接传入 img subject 时留空即可；复杂 subject 可用此图片提供 alpha 外围。",
    accept: ["image/png", "image/webp"],
    default: "",
  }),
  strokeWidth: field.number({
    label: "线条粗细",
    min: 1,
    max: 120,
    default: 14,
  }),
  color: field.color({ label: "线条颜色", default: "#ff5a36" }),
  startOffset: field.number({
    label: "起点位置",
    description: "沿主体外围的周长百分比。0 是自动提取路径的起点，50 是半圈处。",
    min: 0,
    max: 100,
    default: 0,
  }),
  outlineGap: field.number({
    label: "轮廓外扩",
    description: "粗线中心与原始 alpha 边缘之间的像素距离。",
    min: 0,
    max: 48,
    default: 6,
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
  lineCap: field.enum(["round", "square", "butt"] as const, {
    label: "线帽",
    default: "round",
  }),
  lineJoin: field.enum(["round", "bevel", "miter"] as const, {
    label: "转角",
    default: "round",
  }),
  opacity: field.number({
    label: "透明度",
    min: 0,
    max: 1,
    default: 1,
  }),
  glow: field.number({
    label: "发光强度",
    min: 0,
    max: 40,
    default: 0,
  }),
});

export type OutlineDrawProps = InferFields<typeof outlineDrawSchema>;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface BoundaryEdge {
  readonly from: Point;
  readonly to: Point;
  readonly direction: number;
}

export interface TraceAlphaOutlineOptions {
  readonly alpha: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly outputWidth?: number;
  readonly outputHeight?: number;
  readonly threshold?: number;
  readonly dilation?: number;
  readonly smoothing?: number;
}

function pointKey(point: Point, stride: number): number {
  return point.y * stride + point.x;
}

function addEdge(edges: BoundaryEdge[], from: Point, to: Point): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const direction = dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3;
  edges.push({ from, to, direction });
}

function dilateMask(
  input: Uint8Array,
  width: number,
  height: number,
  iterations: number,
): Uint8Array {
  let current = input;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = current.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (current[index] === 0) continue;
        for (let dy = -1; dy <= 1; dy += 1) {
          const nextY = y + dy;
          if (nextY < 0 || nextY >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nextX = x + dx;
            if (nextX >= 0 && nextX < width) next[nextY * width + nextX] = 1;
          }
        }
      }
    }
    current = next;
  }
  return current;
}

function boundaryEdges(mask: Uint8Array, width: number, height: number): BoundaryEdge[] {
  const edges: BoundaryEdge[] = [];
  const filled = (x: number, y: number): boolean =>
    x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x] === 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) addEdge(edges, { x, y }, { x: x + 1, y });
      if (!filled(x + 1, y)) addEdge(edges, { x: x + 1, y }, { x: x + 1, y: y + 1 });
      if (!filled(x, y + 1)) addEdge(edges, { x: x + 1, y: y + 1 }, { x, y: y + 1 });
      if (!filled(x - 1, y)) addEdge(edges, { x, y: y + 1 }, { x, y });
    }
  }
  return edges;
}

function chooseNextEdge(
  edges: readonly BoundaryEdge[],
  candidates: readonly number[],
  previousDirection: number,
): number | undefined {
  const turnPriority = [1, 0, 3, 2];
  for (const turn of turnPriority) {
    const candidate = candidates.find((index) =>
      (edges[index]!.direction - previousDirection + 4) % 4 === turn
    );
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

function polygonArea(points: readonly Point[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += point.x * next.y - next.x * point.y;
  }
  return area / 2;
}

function boundaryLoops(edges: readonly BoundaryEdge[], width: number): Point[][] {
  const stride = width + 1;
  const outgoing = new Map<number, number[]>();
  const used = new Uint8Array(edges.length);
  for (let index = 0; index < edges.length; index += 1) {
    const key = pointKey(edges[index]!.from, stride);
    const entries = outgoing.get(key) ?? [];
    entries.push(index);
    outgoing.set(key, entries);
  }

  const loops: Point[][] = [];
  for (let startIndex = 0; startIndex < edges.length; startIndex += 1) {
    if (used[startIndex] === 1) continue;
    const start = edges[startIndex]!.from;
    const points: Point[] = [start];
    let edgeIndex: number | undefined = startIndex;
    let guard = 0;
    while (edgeIndex !== undefined && guard <= edges.length) {
      const edge = edges[edgeIndex]!;
      used[edgeIndex] = 1;
      if (edge.to.x === start.x && edge.to.y === start.y) break;
      points.push(edge.to);
      const candidates = (outgoing.get(pointKey(edge.to, stride)) ?? [])
        .filter((index) => used[index] === 0);
      edgeIndex = chooseNextEdge(edges, candidates, edge.direction);
      guard += 1;
    }
    if (points.length >= 3) loops.push(points);
  }
  return loops;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const amount = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy),
  ));
  return Math.hypot(
    point.x - (start.x + amount * dx),
    point.y - (start.y + amount * dy),
  );
}

function simplifyOpen(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return [...points];
  let farthestIndex = 0;
  let farthestDistance = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(points[index]!, points[0]!, points.at(-1)!);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  }
  if (farthestDistance <= tolerance) return [points[0]!, points.at(-1)!];
  const left = simplifyOpen(points.slice(0, farthestIndex + 1), tolerance);
  const right = simplifyOpen(points.slice(farthestIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function simplifyClosed(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 4 || tolerance <= 0) return [...points];
  const anchor = points[0]!;
  let splitIndex = 1;
  let farthest = 0;
  for (let index = 1; index < points.length; index += 1) {
    const distance = Math.hypot(points[index]!.x - anchor.x, points[index]!.y - anchor.y);
    if (distance > farthest) {
      farthest = distance;
      splitIndex = index;
    }
  }
  const first = simplifyOpen(points.slice(0, splitIndex + 1), tolerance);
  const second = simplifyOpen(
    [...points.slice(splitIndex), ...points.slice(0, 1)],
    tolerance,
  );
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

function coordinate(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function curvedPath(points: readonly Point[]): string {
  if (points.length < 3) return "";
  const first = points[0]!;
  const last = points.at(-1)!;
  const start = { x: (last.x + first.x) / 2, y: (last.y + first.y) / 2 };
  let path = `M ${coordinate(start.x)} ${coordinate(start.y)}`;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const next = points[(index + 1) % points.length]!;
    path += ` Q ${coordinate(point.x)} ${coordinate(point.y)} ${coordinate((point.x + next.x) / 2)} ${coordinate((point.y + next.y) / 2)}`;
  }
  return `${path} Z`;
}

/** Extracts the largest closed alpha boundary and returns it as a smooth SVG path. */
export function traceAlphaOutline(options: TraceAlphaOutlineOptions): string {
  const { alpha, width, height } = options;
  if (width < 1 || height < 1 || alpha.length !== width * height) return "";
  const threshold = options.threshold ?? 8;
  const initial = new Uint8Array(width * height);
  for (let index = 0; index < alpha.length; index += 1) {
    initial[index] = alpha[index]! >= threshold ? 1 : 0;
  }
  const mask = dilateMask(initial, width, height, Math.max(0, Math.round(options.dilation ?? 0)));
  const loops = boundaryLoops(boundaryEdges(mask, width, height), width);
  const largest = loops.sort((left, right) =>
    Math.abs(polygonArea(right)) - Math.abs(polygonArea(left))
  )[0];
  if (largest === undefined) return "";
  const outputWidth = options.outputWidth ?? width;
  const outputHeight = options.outputHeight ?? height;
  const scaled = largest.map((point) => ({
    x: point.x * outputWidth / width,
    y: point.y * outputHeight / height,
  }));
  return curvedPath(simplifyClosed(scaled, Math.max(0, options.smoothing ?? 0)));
}

/** The growing dash and its gap always add up to the normalized path length. */
export function outlineDrawFrames(): readonly FourierMotionTarget[] {
  return [
    { strokeDasharray: "0 100", offset: 0 },
    { strokeDasharray: "100 0", offset: 0.88 },
    { strokeDasharray: "100 0", offset: 1 },
  ];
}

function normalizedStartOffset(value: number): number {
  return -(((value % 100) + 100) % 100);
}

function imagePlacement(
  imageWidth: number,
  imageHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  props: OutlineDrawProps,
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
    x: (canvasWidth - width) / 2 + props.positionX * canvasWidth / 960,
    y: (canvasHeight - height) / 2 + props.positionY * canvasHeight / 540,
    width,
    height,
  };
}

function useTracedOutline(
  source: string | undefined,
  props: OutlineDrawProps,
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
              "OutlineDraw 需要直接的 <img src=...> subject，或通过 outlineSource 传入透明轮廓图",
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
          if (context === null) throw new Error("OutlineDraw 无法创建 alpha 采样 Canvas");
          context.clearRect(0, 0, sampleWidth, sampleHeight);
          const placement = imagePlacement(
            image.naturalWidth,
            image.naturalHeight,
            sampleWidth,
            sampleHeight,
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
          if (path === "") throw new Error("OutlineDraw 没有在轮廓图中找到非透明像素");
          if (pathRef.current === null) throw new Error("OutlineDraw 的 SVG path 尚未挂载");
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

function fittedSubject(subject: ReactNode, fit: OutlineDrawProps["fit"]): ReactNode {
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

function OutlineLayer({
  children,
  source,
  props,
}: {
  children: ReactNode;
  source: string | undefined;
  props: OutlineDrawProps;
}): ReactNode {
  const { width, height } = useFourierContext();
  const pathRef = useRef<SVGPathElement>(null);
  const glow = Math.max(0, props.glow);
  useTracedOutline(source, props, width, height, pathRef);

  return (
    <FourierMotion>
      <div
        data-outline-draw=""
        style={{
          position: "relative",
          width,
          height,
          overflow: "hidden",
          isolation: "isolate",
        }}
      >
        <div
          data-outline-draw-subject=""
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
          data-outline-draw-overlay=""
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
            data-outline-draw-path=""
            d="M 0 0 Z"
            pathLength={100}
            fill="none"
            stroke={props.color}
            strokeWidth={props.strokeWidth}
            strokeLinecap={props.lineCap}
            strokeLinejoin={props.lineJoin}
            strokeDashoffset={normalizedStartOffset(props.startOffset)}
            vectorEffect="non-scaling-stroke"
            animate={outlineDrawFrames()}
            transition={{ ease: [0.45, 0, 0.2, 1], fill: "both" }}
            style={{
              opacity: props.opacity,
              filter: glow === 0
                ? undefined
                : `drop-shadow(0 0 ${glow}px ${props.color})`,
              willChange: "stroke-dasharray",
            }}
          />
        </svg>
      </div>
    </FourierMotion>
  );
}

export const OutlineDraw = defineMotion({
  name: "OutlineDraw",
  schema: outlineDrawSchema,
  supportsTextMotion: false,
  component({ subject, props }) {
    const source = props.outlineSource || directImageSource(subject);
    return <OutlineLayer source={source} props={props}>{subject}</OutlineLayer>;
  },
  preview() {
    return { representativeProgress: 0.68, priority: "primary" };
  },
  designPreview() {
    return {
      props: {},
      subject: (
        <img
          src={humanImageUrl}
          width={1122}
          height={1402}
          alt="Alpha outline example"
        />
      ),
      composition: { width: 960, height: 540, durationSeconds: 3 },
      player: { background: "#08111d", loop: true },
    };
  },
});

export default OutlineDraw;
