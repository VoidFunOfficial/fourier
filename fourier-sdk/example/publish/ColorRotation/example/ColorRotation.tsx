import {
  FourierMotion,
  defineReact,
  defineSchema,
  field,
  motion,
  useFourierContext,
  type CSSProperties,
  type FourierMotionTarget,
  type InferFields,
} from "@fourier-video/sdk";

export const COLOR_ROTATION_CORNERS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

export type ColorRotationCorner = typeof COLOR_ROTATION_CORNERS[number];

export const MAX_COLOR_ROTATION_TRANSITIONS = 6;

const cornerField = (label: string, defaultValue: ColorRotationCorner) =>
  field.enum(COLOR_ROTATION_CORNERS, {
    label,
    description: "选择颜色分界线扫入画面的旋转圆心。",
    default: defaultValue,
  });

export const colorRotationSchema = defineSchema({
  transitionCount: field.number({
    label: "转场次数",
    description: "按顺序启用下方的颜色和角落；初始颜色不计入次数。",
    min: 1,
    max: MAX_COLOR_ROTATION_TRANSITIONS,
    integer: true,
    default: 4,
  }),
  initialColor: field.color({ label: "初始颜色", default: "#101114" }),
  transition1Color: field.color({ label: "转场 1 · 颜色", default: "#ff5c35" }),
  transition1Corner: cornerField("转场 1 · 角落", "top-left"),
  transition2Color: field.color({ label: "转场 2 · 颜色", default: "#d8ff3e" }),
  transition2Corner: cornerField("转场 2 · 角落", "bottom-right"),
  transition3Color: field.color({ label: "转场 3 · 颜色", default: "#4169ff" }),
  transition3Corner: cornerField("转场 3 · 角落", "top-right"),
  transition4Color: field.color({ label: "转场 4 · 颜色", default: "#ff4f91" }),
  transition4Corner: cornerField("转场 4 · 角落", "bottom-left"),
  transition5Color: field.color({ label: "转场 5 · 颜色", default: "#29d6c7" }),
  transition5Corner: cornerField("转场 5 · 角落", "top-left"),
  transition6Color: field.color({ label: "转场 6 · 颜色", default: "#8d5cff" }),
  transition6Corner: cornerField("转场 6 · 角落", "bottom-right"),
  edgeShadow: field.boolean({
    label: "旋转边缘阴影",
    description: "转动时用轻微阴影强调前后色板的层次。",
    default: true,
  }),
});

export type ColorRotationProps = InferFields<typeof colorRotationSchema>;

export interface ColorRotationStep {
  readonly color: string;
  readonly corner: ColorRotationCorner;
}

const TIMELINE_INSET = 0.025;
const MOTION_FRACTION = 0.92;
const ARC_POINTS = 24;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value: number): number {
  return Number(value.toFixed(5));
}

function cornerArc(corner: ColorRotationCorner): readonly [number, number] {
  if (corner === "top-left") return [0, Math.PI / 2];
  if (corner === "top-right") return [Math.PI, Math.PI / 2];
  if (corner === "bottom-left") return [0, -Math.PI / 2];
  return [Math.PI, Math.PI * 1.5];
}

function cornerPoint(
  corner: ColorRotationCorner,
  width: number,
  height: number,
): readonly [number, number] {
  if (corner === "top-left") return [0, 0];
  if (corner === "top-right") return [width, 0];
  if (corner === "bottom-left") return [0, height];
  return [width, height];
}

function pixels(value: number): string {
  return `${Number(value.toFixed(3))}px`;
}

/** A same-point-count sector polygon, so browsers interpolate its rotating edge. */
export function colorRotationClipPath(
  corner: ColorRotationCorner,
  sweepProgress: number,
  width: number,
  height: number,
): string {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const [originX, originY] = cornerPoint(corner, safeWidth, safeHeight);
  const [startAngle, endAngle] = cornerArc(corner);
  const angle = startAngle + (endAngle - startAngle) * sweepProgress;
  const radius = Math.hypot(safeWidth, safeHeight) * 1.08;
  const points = [`${pixels(originX)} ${pixels(originY)}`];

  for (let pointIndex = 0; pointIndex <= ARC_POINTS; pointIndex += 1) {
    const fraction = pointIndex / ARC_POINTS;
    const pointAngle = startAngle + (angle - startAngle) * fraction;
    points.push(
      `${pixels(originX + Math.cos(pointAngle) * radius)} ${
        pixels(originY + Math.sin(pointAngle) * radius)
      }`,
    );
  }
  return `polygon(${points.join(", ")})`;
}

/**
 * Builds one full-timeline color sweep. Only the sector boundary rotates; the
 * colored plane itself never tilts. One continuous ease-in-out curve keeps the
 * movement fluid without overshoot, rebound, or abrupt braking.
 */
export function colorRotationFrames(
  index: number,
  transitionCount: number,
  corner: ColorRotationCorner,
  width: number,
  height: number,
): readonly FourierMotionTarget[] {
  const count = clamp(Math.floor(transitionCount), 1, MAX_COLOR_ROTATION_TRANSITIONS);
  const safeIndex = clamp(Math.floor(index), 0, count - 1);
  const slot = (1 - TIMELINE_INSET * 2) / count;
  const start = TIMELINE_INSET + safeIndex * slot;
  const duration = slot * MOTION_FRACTION;
  const end = rounded(start + duration);
  const clip = (progress: number): string =>
    colorRotationClipPath(corner, progress, width, height);

  return [
    { clipPath: clip(0), offset: 0 },
    {
      clipPath: clip(0),
      offset: rounded(start),
      easing: "cubic-bezier(0.4, 0, 0.6, 1)",
    },
    { clipPath: clip(1), offset: end },
    { clipPath: clip(1), offset: 1 },
  ];
}

export function colorRotationSteps(
  props: ColorRotationProps,
): readonly ColorRotationStep[] {
  const steps: readonly ColorRotationStep[] = [
    { color: props.transition1Color, corner: props.transition1Corner },
    { color: props.transition2Color, corner: props.transition2Corner },
    { color: props.transition3Color, corner: props.transition3Corner },
    { color: props.transition4Color, corner: props.transition4Corner },
    { color: props.transition5Color, corner: props.transition5Corner },
    { color: props.transition6Color, corner: props.transition6Corner },
  ];
  return steps.slice(
    0,
    clamp(Math.floor(props.transitionCount), 1, MAX_COLOR_ROTATION_TRANSITIONS),
  );
}

function colorLayerStyle(
  color: string,
  edgeShadow: boolean,
): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    background: color,
    filter: edgeShadow ? "drop-shadow(0 0 18px rgba(0, 0, 0, 0.32))" : "none",
    backfaceVisibility: "hidden",
    willChange: "clip-path",
  };
}

function ColorRotationLayer({ props }: { props: ColorRotationProps }) {
  const { width, height } = useFourierContext();
  const steps = colorRotationSteps(props);

  return (
    <FourierMotion>
      <div
        role="group"
        aria-label="Color rotation transition"
        style={{
          position: "relative",
          width,
          height,
          overflow: "hidden",
          isolation: "isolate",
          background: props.initialColor,
          pointerEvents: "none",
        }}
      >
        {steps.map((step, index) => (
          <motion.div
            key={index}
            data-color-rotation-step={index + 1}
            data-color-rotation-corner={step.corner}
            aria-hidden="true"
            animate={colorRotationFrames(
              index,
              steps.length,
              step.corner,
              width,
              height,
            )}
            transition={{ ease: "linear", fill: "both" }}
            style={{
              ...colorLayerStyle(step.color, props.edgeShadow),
              zIndex: index + 1,
            }}
          />
        ))}
      </div>
    </FourierMotion>
  );
}

export const ColorRotation = defineReact({
  name: "ColorRotation",
  schema: colorRotationSchema,
  component({ props }) {
    return <ColorRotationLayer props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 6 },
      player: { background: "#101114", loop: true },
    };
  },
});

export default ColorRotation;
