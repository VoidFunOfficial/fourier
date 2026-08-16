import mailDraftSvg from "../placeholder/pic/mail-draft.svg" with { type: "text" };
import mailReadySvg from "../placeholder/pic/mail-ready.svg" with { type: "text" };
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

export const SMOOTH_ALPHA_EASING = "cubic-bezier(0.45, 0, 0.55, 1)";

function svgDataUrl(source: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

const mailDraftUrl = svgDataUrl(mailDraftSvg);
const mailReadyUrl = svgDataUrl(mailReadySvg);

export const smoothChangeSchema = defineSchema({
  firstImage: field.asset({
    label: "生成前图片",
    description: "先显示，并在 Generate-Fill 切换前快速抖动的第一张图片。",
    accept: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
  }),
  secondImage: field.asset({
    label: "生成后图片",
    description: "在相同抖动相位中通过 SmoothAlpha 接管并稳定显示的第二张图片。",
    accept: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
  }),
  transitionStart: field.number({
    label: "生成开始位置",
    description: "快速抖动与 SmoothAlpha 形态接管开始时在完整时间轴中的比例。",
    min: 0.2,
    max: 0.8,
    default: 0.48,
  }),
  transitionDuration: field.number({
    label: "生成时长比例",
    description: "抖动、SmoothAlpha 接管与第二张图片稳定所占的时间轴比例。",
    min: 0.12,
    max: 0.4,
    default: 0.24,
  }),
  shakeIntensity: field.number({
    label: "抖动强度",
    description: "Generate-Fill 阶段的最大像素位移。",
    min: 2,
    max: 24,
    default: 10,
  }),
  shakeCount: field.number({
    label: "抖动次数",
    description: "形态接管期间快速往返的次数。",
    min: 3,
    max: 12,
    integer: true,
    default: 7,
  }),
  imageSize: field.number({
    label: "图片尺寸",
    description: "图片相对画布短边的百分比。",
    min: 20,
    max: 90,
    default: 58,
  }),
});

export type SmoothChangeProps = InferFields<typeof smoothChangeSchema>;
export type SmoothAlphaLayer = "outgoing" | "incoming";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value: number): number {
  return Number(value.toFixed(5));
}

function transitionWindow(start: number, duration: number): readonly [number, number] {
  const safeStart = clamp(start, 0.001, 0.999);
  const safeEnd = clamp(safeStart + Math.max(0.001, duration), safeStart + 0.001, 1);
  return [rounded(safeStart), rounded(safeEnd)];
}

/**
 * Keeps the entire image replacement inside the active shake interval. The
 * last 18% of that interval belongs only to image two, which then settles.
 */
export function smoothChangeHandoffWindow(
  shakeStart: number,
  shakeDuration: number,
): readonly [number, number] {
  const safeStart = clamp(shakeStart, 0.001, 0.8);
  const safeDuration = clamp(shakeDuration, 0.08, 0.6);
  return [
    rounded(safeStart + safeDuration * 0.2),
    rounded(safeStart + safeDuration * 0.82),
  ];
}

/** Complementary opacity frames used by both layers during the handoff. */
export function smoothAlphaFrames(
  layer: SmoothAlphaLayer,
  start: number,
  duration: number,
): readonly FourierMotionTarget[] {
  const [transitionStart, transitionEnd] = transitionWindow(start, duration);
  const outgoing = layer === "outgoing";
  const before = outgoing ? 1 : 0;
  const after = outgoing ? 0 : 1;

  return [
    { opacity: before, offset: 0 },
    {
      opacity: before,
      offset: transitionStart,
      easing: SMOOTH_ALPHA_EASING,
    },
    { opacity: after, offset: transitionEnd },
    { opacity: after, offset: 1 },
  ];
}

/**
 * Generate-Fill style motion: both images share every shake phase while the
 * incoming image removes the last residual movement and blur.
 */
export function smoothChangeShakeFrames(
  start: number,
  duration: number,
  intensity: number,
  shakeCount: number,
): readonly FourierMotionTarget[] {
  const safeStart = clamp(start, 0.001, 0.8);
  const safeDuration = clamp(duration, 0.08, 0.6);
  const end = clamp(safeStart + safeDuration, safeStart + 0.001, 0.999);
  const count = Math.floor(clamp(shakeCount, 3, 12));
  const amplitude = clamp(intensity, 0, 30);
  const frames: FourierMotionTarget[] = [{
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
    filter: "blur(0px)",
    offset: 0,
  }];

  if (safeStart > 0) {
    frames.push({
      x: 0,
      y: 0,
      rotate: 0,
      scale: 1,
      filter: "blur(0px)",
      offset: rounded(safeStart),
    });
  }

  for (let index = 1; index <= count; index += 1) {
    const phase = index / (count + 1);
    const direction = index % 2 === 0 ? -1 : 1;
    const envelope = Math.sin(phase * Math.PI);
    const sharedAmplitude = amplitude * envelope;
    frames.push({
      x: rounded(direction * sharedAmplitude),
      y: rounded(-direction * sharedAmplitude * 0.32),
      rotate: rounded(direction * sharedAmplitude * 0.42),
      scale: rounded(1 + envelope * 0.035),
      filter: `blur(${rounded(envelope * 1.8)}px)`,
      offset: rounded(safeStart + safeDuration * phase),
    });
  }

  frames.push({
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
    filter: "blur(0px)",
    offset: rounded(end),
  });
  if (end < 1) {
    frames.push({
      x: 0,
      y: 0,
      rotate: 0,
      scale: 1,
      filter: "blur(0px)",
      offset: 1,
    });
  }
  return frames;
}

type SmoothAlphaProps = Readonly<Pick<
  SmoothChangeProps,
  | "firstImage"
  | "secondImage"
  | "transitionStart"
  | "transitionDuration"
  | "shakeIntensity"
  | "shakeCount"
  | "imageSize"
>>;

/** Must be rendered below one FourierMotion root. */
export function SmoothAlpha(props: SmoothAlphaProps) {
  const { width, height } = useFourierContext();
  const imagePixels = Math.min(width, height) * props.imageSize / 100;
  const [handoffStart, handoffEnd] = smoothChangeHandoffWindow(
    props.transitionStart,
    props.transitionDuration,
  );
  const handoffDuration = handoffEnd - handoffStart;
  const layerStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    transformOrigin: "50% 50%",
    willChange: "transform",
    pointerEvents: "none",
  };
  const imageStyle: CSSProperties = {
    width: imagePixels,
    height: imagePixels,
    objectFit: "contain",
    display: "block",
    willChange: "opacity",
    pointerEvents: "none",
    userSelect: "none",
  };

  return (
    <>
      <motion.div
        animate={smoothChangeShakeFrames(
          props.transitionStart,
          props.transitionDuration,
          props.shakeIntensity,
          props.shakeCount,
        )}
        transition={{ fill: "both" }}
        style={{ ...layerStyle, zIndex: 1 }}
      >
        <motion.img
          src={props.firstImage}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="sync"
          animate={smoothAlphaFrames(
            "outgoing",
            handoffStart,
            handoffDuration,
          )}
          transition={{ fill: "both" }}
          style={imageStyle}
        />
      </motion.div>
      <motion.div
        animate={smoothChangeShakeFrames(
          props.transitionStart,
          props.transitionDuration,
          props.shakeIntensity,
          props.shakeCount,
        )}
        transition={{ fill: "both" }}
        style={{ ...layerStyle, zIndex: 2 }}
      >
        <motion.img
          src={props.secondImage}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="sync"
          animate={smoothAlphaFrames(
            "incoming",
            handoffStart,
            handoffDuration,
          )}
          transition={{ fill: "both" }}
          style={imageStyle}
        />
      </motion.div>
    </>
  );
}

function SmoothChangeLayer({ props }: { props: SmoothChangeProps }) {
  const { width, height } = useFourierContext();

  return (
    <FourierMotion>
      <div
        aria-label="Smooth image change"
        style={{
          position: "relative",
          width,
          height,
          overflow: "hidden",
          background: "transparent",
        }}
      >
        <SmoothAlpha {...props} />
      </div>
    </FourierMotion>
  );
}

export const SmoothChange = defineReact({
  name: "SmoothChange",
  schema: smoothChangeSchema,
  component({ props }) {
    return <SmoothChangeLayer props={props} />;
  },
  designPreview() {
    return {
      props: {
        firstImage: mailDraftUrl,
        secondImage: mailReadyUrl,
      },
      composition: { width: 960, height: 540, durationSeconds: 4 },
      player: { background: "#f8fafc", loop: true },
    };
  },
});

export default SmoothChange;
