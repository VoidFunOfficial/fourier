import mailDraftUrl from "../assets/mail-draft.svg";
import mailReadyUrl from "../assets/mail-ready.svg";
import searchCursorUrl from "../assets/cursor-search.svg";
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

export const smoothChangeSchema = defineSchema({
  firstImage: field.asset({
    label: "Before image",
    description: "The first image, shown before the rapid Generate-Fill shake begins.",
    accept: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
    default: mailDraftUrl,
  }),
  secondImage: field.asset({
    label: "After image",
    description: "The second image, which takes over through SmoothAlpha and settles in place.",
    accept: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
    default: mailReadyUrl,
  }),
  transitionStart: field.number({
    label: "Transition start",
    description: "The point on the full timeline where the rapid shake and SmoothAlpha handoff begin.",
    min: 0.2,
    max: 0.8,
    default: 0.48,
  }),
  transitionDuration: field.number({
    label: "Transition duration",
    description: "The share of the timeline used by the shake, SmoothAlpha handoff, and final settle.",
    min: 0.12,
    max: 0.4,
    default: 0.24,
  }),
  shakeIntensity: field.number({
    label: "Shake intensity",
    description: "The maximum pixel displacement during the Generate-Fill phase.",
    min: 2,
    max: 24,
    default: 10,
  }),
  shakeCount: field.number({
    label: "Shake count",
    description: "The number of rapid direction changes during the image handoff.",
    min: 3,
    max: 12,
    integer: true,
    default: 7,
  }),
  imageSize: field.number({
    label: "Image size",
    description: "The image size as a percentage of the canvas short edge.",
    min: 20,
    max: 90,
    default: 58,
  }),
  hitStart: field.number({
    label: "Hit timing",
    description: "The point where the Search cursor strikes the generated mail.",
    min: 0.72,
    max: 0.88,
    default: 0.8,
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

/** The mail anticipates the impact, compresses on contact, then exits right. */
export function mailHitFrames(
  hitStart: number,
  width: number,
): readonly FourierMotionTarget[] {
  const hit = clamp(hitStart, 0.72, 0.88);
  return [
    { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1, filter: "blur(0px)", offset: 0 },
    { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1, filter: "blur(0px)", offset: rounded(hit - 0.045) },
    { x: -18, y: 0, rotate: -1.8, scaleX: 1.045, scaleY: 0.97, opacity: 1, filter: "blur(0px)", easing: "cubic-bezier(.2,.8,.2,1)", offset: rounded(hit - 0.012) },
    { x: 18, y: -2, rotate: 3.4, scaleX: 0.88, scaleY: 1.12, opacity: 1, filter: "blur(0px)", easing: "cubic-bezier(.16,1,.3,1)", offset: rounded(hit) },
    { x: width * 0.13, y: -22, rotate: 9, scaleX: 1.04, scaleY: 0.96, opacity: 1, filter: "blur(1px)", offset: rounded(hit + 0.045) },
    { x: width * 0.62, y: -105, rotate: 23, scaleX: 0.84, scaleY: 0.9, opacity: 0.96, filter: "blur(4px)", offset: rounded(Math.min(0.96, hit + 0.13)) },
    { x: width * 1.08, y: -190, rotate: 42, scaleX: 0.62, scaleY: 0.72, opacity: 0, filter: "blur(9px)", offset: 1 },
  ];
}

/** The cursor winds up on the left, hits once, and recoils from the mail. */
export function searchCursorHitFrames(
  hitStart: number,
  mailLeft: number,
  centerY: number,
): readonly FourierMotionTarget[] {
  const hit = clamp(hitStart, 0.72, 0.88);
  return [
    { x: mailLeft - 390, y: centerY + 82, rotate: -18, scale: 0.76, opacity: 0, filter: "blur(0px)", offset: 0 },
    { x: mailLeft - 390, y: centerY + 82, rotate: -18, scale: 0.76, opacity: 0, filter: "blur(0px)", offset: rounded(hit - 0.1) },
    { x: mailLeft - 285, y: centerY + 54, rotate: -13, scale: 1, opacity: 1, filter: "blur(0px)", easing: "cubic-bezier(.16,1,.3,1)", offset: rounded(hit - 0.075) },
    { x: mailLeft - 205, y: centerY + 70, rotate: -24, scale: 1.12, opacity: 1, filter: "blur(0px)", easing: "cubic-bezier(.7,0,.84,0)", offset: rounded(hit - 0.035) },
    { x: mailLeft - 24, y: centerY + 4, rotate: 17, scale: 1.22, opacity: 1, filter: "blur(1px)", offset: rounded(hit) },
    { x: mailLeft - 118, y: centerY + 35, rotate: -9, scale: 0.96, opacity: 1, filter: "blur(0px)", offset: rounded(hit + 0.045) },
    { x: mailLeft - 168, y: centerY + 62, rotate: -15, scale: 0.82, opacity: 0, filter: "blur(3px)", offset: rounded(Math.min(0.97, hit + 0.11)) },
    { x: mailLeft - 168, y: centerY + 62, rotate: -15, scale: 0.82, opacity: 0, filter: "blur(3px)", offset: 1 },
  ];
}

export function impactFrames(hitStart: number): readonly FourierMotionTarget[] {
  const hit = clamp(hitStart, 0.72, 0.88);
  return [
    { opacity: 0, scale: 0.25, rotate: -12, offset: 0 },
    { opacity: 0, scale: 0.25, rotate: -12, offset: rounded(hit - 0.003) },
    { opacity: 1, scale: 0.5, rotate: 0, offset: rounded(hit) },
    { opacity: 0, scale: 1.9, rotate: 22, offset: rounded(Math.min(0.98, hit + 0.06)) },
    { opacity: 0, scale: 1.9, rotate: 22, offset: 1 },
  ];
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
  const imagePixels = Math.min(width, height) * props.imageSize / 100;
  const mailLeft = width / 2 - imagePixels / 2;
  const impactX = mailLeft + 8;
  const impactY = height / 2;

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
        <motion.div
          animate={mailHitFrames(props.hitStart, width)}
          transition={{ ease: "linear", fill: "both" }}
          style={{ position: "absolute", inset: 0, transformOrigin: "50% 50%", willChange: "transform, opacity, filter" }}
        >
          <SmoothAlpha {...props} />
        </motion.div>

        <motion.div
          aria-hidden="true"
          animate={impactFrames(props.hitStart)}
          transition={{ ease: "linear", fill: "both" }}
          style={{
            position: "absolute",
            left: impactX - 42,
            top: impactY - 42,
            width: 84,
            height: 84,
            borderRadius: "50%",
            border: "7px solid rgba(216,242,239,.9)",
            boxShadow: "0 0 28px rgba(78,170,163,.75)",
            zIndex: 8,
          }}
        />

        <motion.img
          src={searchCursorUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="sync"
          animate={searchCursorHitFrames(props.hitStart, mailLeft, height / 2)}
          transition={{ ease: "linear", fill: "both" }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 112,
            height: 112,
            zIndex: 10,
            transformOrigin: "30px 24px",
            filter: "drop-shadow(8px 12px 5px rgba(22,24,39,.38))",
            willChange: "transform, opacity, filter",
          }}
        />
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
