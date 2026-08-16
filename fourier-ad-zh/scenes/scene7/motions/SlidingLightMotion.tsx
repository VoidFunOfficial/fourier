import {
  FourierMotion,
  defineMotion,
  defineSchema,
  field,
  loadFont,
  motion,
  useFourierContext,
  type CSSProperties,
  type FourierMotionTarget,
  type InferFields,
  type ReactNode,
} from "@fourier-video/sdk/motion";
import slidingLightFontUrl from "../assets/Montserrat-Medium.ttf";

const slidingLightFont = loadFont(slidingLightFontUrl, { weight: 500 });

export const slidingLightMotionSchema = defineSchema({
  textColor: field.color({
    label: "Text color",
    description: "The text color revealed by the moving light.",
    default: "#28241f",
  }),
  lightColor: field.color({
    label: "Light color",
    description: "The color of the moving light, its trail, and its glow.",
    default: "#d96843",
  }),
  fontSize: field.number({
    label: "Font size",
    description: "The Text Motion font size in pixels.",
    min: 18,
    max: 240,
    default: 68,
  }),
  letterSpacing: field.number({
    label: "Letter spacing",
    description: "Letter spacing in pixels.",
    min: -8,
    max: 40,
    default: 1,
  }),
  lineGap: field.number({
    label: "Line gap",
    description: "Extra spacing between lines, measured in em.",
    min: 0,
    max: 1,
    default: 0.14,
  }),
  barWidth: field.number({
    label: "Maximum text width",
    description: "Maximum width of the Text Motion wrapping area as a percentage of the canvas.",
    min: 30,
    max: 100,
    default: 82,
  }),
  trailLength: field.number({
    label: "Trail length",
    description: "Fixed light-trail length as a percentage of the text stage.",
    min: 10,
    max: 64,
    default: 56,
  }),
  barOpacity: field.number({
    label: "Trail start opacity",
    description: "Opacity at the left edge; the trail brightens continuously toward the light head.",
    min: 0.02,
    max: 0.3,
    default: 0.06,
  }),
  startVisible: field.number({
    label: "Initial reveal",
    description: "The number of light-trail pixels initially visible from the left edge.",
    min: 2,
    max: 40,
    default: 12,
  }),
  barHeight: field.number({
    label: "Trail height",
    description: "Text Motion trail height relative to the font size.",
    min: 0.6,
    max: 1.8,
    default: 1.32,
  }),
  edgeSoftness: field.number({
    label: "Light-head width",
    description: "Width of the soft light at the leading edge, in pixels.",
    min: 4,
    max: 120,
    default: 24,
  }),
  glowRadius: field.number({
    label: "Glow radius",
    description: "Glow radius of the light head, in pixels.",
    min: 0,
    max: 64,
    default: 10,
  }),
});

export type SlidingLightMotionProps = InferFields<typeof slidingLightMotionSchema>;

const REVEAL_START = 0.08;
const REVEAL_END = 0.86;

export function slidingLightRevealFrames(
  startVisible: number,
): readonly FourierMotionTarget[] {
  const visible = Math.min(40, Math.max(2, startVisible));
  const initial = `inset(-42% calc(100% - ${visible}px) -42% 0)`;
  const complete = "inset(-42% 0 -42% 0)";
  return [
    { clipPath: initial, offset: 0 },
    { clipPath: initial, offset: REVEAL_START },
    { clipPath: complete, offset: REVEAL_END },
    { clipPath: complete, offset: 1 },
  ];
}

export function slidingLightSweepFrames(
  trailLength: number,
  startVisible: number,
): readonly FourierMotionTarget[] {
  const length = Math.min(64, Math.max(10, trailLength));
  const visible = Math.min(40, Math.max(2, startVisible));
  const start = `calc(-${length}% + ${visible}px)`;
  const beforeFinish = `calc(94% - ${length}%)`;
  const finish = `calc(100% - ${length}%)`;
  return [
    { left: start, opacity: 1, offset: 0 },
    { left: start, opacity: 1, offset: REVEAL_START },
    { left: beforeFinish, opacity: 1, offset: 0.82 },
    { left: finish, opacity: 0, offset: REVEAL_END },
    { left: finish, opacity: 0, offset: 1 },
  ];
}

function opacityPercent(value: number): number {
  return Math.round(value * 1_000) / 10;
}

export function slidingLightTrailGradient(
  color: string,
  leftOpacity: number,
): string {
  const left = Math.min(0.3, Math.max(0.02, leftOpacity));
  const stop = (progress: number): number =>
    opacityPercent(left + (1 - left) * progress);
  return [
    "linear-gradient(90deg",
    `color-mix(in srgb, ${color} ${opacityPercent(left)}%, transparent) 0%`,
    `color-mix(in srgb, ${color} ${stop(0.12)}%, transparent) 28%`,
    `color-mix(in srgb, ${color} ${stop(0.4)}%, transparent) 64%`,
    `color-mix(in srgb, ${color} ${stop(0.78)}%, transparent) 88%`,
    `${color} 100%)`,
  ].join(", ");
}

function SlidingLightBeam({
  props,
  textMode,
}: {
  props: SlidingLightMotionProps;
  textMode: boolean;
}): ReactNode {
  const height = textMode ? `${props.fontSize * props.barHeight}px` : "100%";

  return (
    <motion.span
      aria-hidden="true"
      data-sliding-light-beam=""
      animate={slidingLightSweepFrames(props.trailLength, props.startVisible)}
      transition={{ ease: [0.45, 0, 0.55, 1], fill: "both" }}
      style={{
        position: "absolute",
        top: textMode ? "50%" : 0,
        bottom: textMode ? undefined : 0,
        width: `${props.trailLength}%`,
        height,
        borderRadius: 2,
        transform: textMode ? "translateY(-50%)" : undefined,
        pointerEvents: "none",
        willChange: "left, opacity",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          background: slidingLightTrailGradient(props.lightColor, props.barOpacity),
        }}
      />
      <span
        style={{
          position: "absolute",
          right: 0,
          top: "-8%",
          bottom: "-8%",
          width: Math.max(6, props.edgeSoftness),
          opacity: 0.58,
          background: props.lightColor,
          filter: `blur(${Math.max(3, props.glowRadius * 0.58)}px)`,
        }}
      />
      <span
        style={{
          position: "absolute",
          right: 0,
          top: "2%",
          bottom: "2%",
          width: 2,
          borderRadius: 2,
          background: "#ffffff",
          boxShadow: `0 0 ${Math.max(3, props.glowRadius * 0.5)}px ${props.lightColor}`,
        }}
      />
    </motion.span>
  );
}

function SlidingLightText({
  text,
  props,
}: {
  text: string;
  props: SlidingLightMotionProps;
}): ReactNode {
  const { width, height } = useFourierContext();
  const textStyle: CSSProperties = {
    display: "block",
    color: props.textColor,
    fontFamily: slidingLightFont,
    fontSize: props.fontSize,
    fontWeight: 500,
    fontSynthesis: "none",
    letterSpacing: props.letterSpacing,
    lineHeight: 1 + props.lineGap,
    textAlign: "left",
    whiteSpace: "pre-wrap",
  };

  return (
    <FourierMotion>
      <div
        data-sliding-light-motion="text"
        style={{
          position: "relative",
          width,
          height,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          background: "transparent",
        }}
      >
        <span
          style={{
            position: "relative",
            display: "block",
            width: `${props.barWidth}%`,
            overflow: "hidden",
          }}
        >
          <motion.span
            data-sliding-light-text=""
            animate={slidingLightRevealFrames(props.startVisible)}
            transition={{ ease: [0.45, 0, 0.55, 1], fill: "both" }}
            style={{
              ...textStyle,
              willChange: "clip-path",
            }}
          >
            {text}
          </motion.span>
          {text.length > 0 ? <SlidingLightBeam props={props} textMode /> : null}
        </span>
      </div>
    </FourierMotion>
  );
}

function SlidingLightSubject({
  subject,
  props,
}: {
  subject: ReactNode;
  props: SlidingLightMotionProps;
}): ReactNode {
  const { width, height } = useFourierContext();

  return (
    <FourierMotion>
      <div
        data-sliding-light-motion="subject"
        style={{
          position: "relative",
          width,
          height,
          overflow: "hidden",
          background: "transparent",
        }}
      >
        <motion.div
          animate={slidingLightRevealFrames(props.startVisible)}
          transition={{ ease: [0.45, 0, 0.55, 1], fill: "both" }}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            willChange: "clip-path",
          }}
        >
          {subject}
        </motion.div>
        <SlidingLightBeam props={props} textMode={false} />
      </div>
    </FourierMotion>
  );
}

export const SlidingLightMotion = defineMotion({
  name: "SlidingLightMotion",
  schema: slidingLightMotionSchema,
  supportsTextMotion: true,
  component({ subject, props }) {
    return <SlidingLightSubject subject={subject} props={props} />;
  },
  textComponent({ text, props }) {
    return <SlidingLightText text={text} props={props} />;
  },
  preview() {
    return { representativeProgress: 0.5, priority: "primary" };
  },
  designPreview() {
    return {
      props: {},
      subject: "一切皆可",
      composition: { width: 960, height: 240, durationSeconds: 3 },
      player: {
        background: "#000000",
        loop: true,
      },
    };
  },
});

export default SlidingLightMotion;
