import {
  FourierMotion,
  defineMotion,
  defineSchema,
  field,
  motion,
  useFourierContext,
  type FourierMotionTarget,
  type InferFields,
  type ReactNode,
} from "@fourier-video/sdk/motion";
import placeholderImageUrl from "../placeholder/pic/1.png";

export const springEntranceSchema = defineSchema({
  direction: field.enum([
    "top-to-bottom",
    "bottom-to-top",
    "left-to-right",
    "right-to-left",
  ] as const, {
    label: "移动方向",
    description: "组件从所选方向冲入，越过目标位置后制动回稳。",
    default: "bottom-to-top",
  }),
  distance: field.number({
    label: "位移距离",
    min: 0,
    max: 600,
    default: 180,
  }),
  bounce: field.number({
    label: "回弹幅度",
    description: "0 几乎不越过终点，1 有明显的越位与回拉。",
    min: 0,
    max: 1,
    default: 0.5,
  }),
  momentum: field.number({
    label: "冲入速度",
    description: "控制初速度；值越大，冲入后刹车的感觉越强。",
    min: 0,
    max: 1,
    default: 0.55,
  }),
  settleAt: field.number({
    label: "稳定位置",
    description: "弹簧在整段 Motion 时间轴中的稳定时刻。",
    min: 0.5,
    max: 0.9,
    default: 0.72,
  }),
});

export type SpringEntranceProps = InferFields<typeof springEntranceSchema>;

const SPRING_SAMPLES = 28;
const NATURAL_FREQUENCY = 11;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Analytic spring response with launch velocity, normalized to land exactly on 1. */
export function springEntranceResponse(
  progress: number,
  bounce: number,
  momentum = 0.55,
): number {
  const time = clamp01(progress);
  if (time === 0) return 0;
  if (time === 1) return 1;

  const dampingRatio = 0.94 - clamp01(bounce) * 0.4;
  const dampedFrequency = NATURAL_FREQUENCY * Math.sqrt(1 - dampingRatio ** 2);
  const launchVelocity = 4 + clamp01(momentum) * 6;
  const sineScale = (
    launchVelocity - dampingRatio * NATURAL_FREQUENCY
  ) / dampedFrequency;
  const responseAt = (sample: number): number => 1 +
    Math.exp(-dampingRatio * NATURAL_FREQUENCY * sample) *
      (
        -Math.cos(dampedFrequency * sample) +
        sineScale * Math.sin(dampedFrequency * sample)
      );
  return responseAt(time) / responseAt(1);
}

function displacement(
  direction: SpringEntranceProps["direction"],
  distance: number,
): { x: number; y: number } {
  switch (direction) {
    case "top-to-bottom":
      return { x: 0, y: -distance };
    case "bottom-to-top":
      return { x: 0, y: distance };
    case "left-to-right":
      return { x: -distance, y: 0 };
    case "right-to-left":
      return { x: distance, y: 0 };
  }
}

/** Sampled spring frames keep rendering deterministic at every host time. */
export function springEntranceFrames(
  props: SpringEntranceProps,
): readonly FourierMotionTarget[] {
  const start = displacement(props.direction, props.distance);
  const frames = Array.from({ length: SPRING_SAMPLES + 1 }, (_, index) => {
    const progress = index / SPRING_SAMPLES;
    const response = springEntranceResponse(
      progress,
      props.bounce,
      props.momentum,
    );
    const remaining = 1 - response;

    return {
      x: start.x * remaining,
      y: start.y * remaining,
      offset: progress * props.settleAt,
    } satisfies FourierMotionTarget;
  });

  frames.push({ x: 0, y: 0, offset: 1 });
  return frames;
}

function SpringEntranceLayer({
  children,
  props,
}: {
  children: ReactNode;
  props: SpringEntranceProps;
}): ReactNode {
  const { width, height } = useFourierContext();

  return (
    <FourierMotion>
      <div
        style={{
          width,
          height,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
        }}
      >
        <motion.div
          animate={springEntranceFrames(props)}
          transition={{ ease: "linear" }}
          style={{
            display: "inline-flex",
            maxWidth: "100%",
            maxHeight: "100%",
            willChange: "transform",
          }}
        >
          {children}
        </motion.div>
      </div>
    </FourierMotion>
  );
}

export const SpringEntranceMotion = defineMotion({
  name: "SpringEntranceMotion",
  schema: springEntranceSchema,
  supportsTextMotion: false,
  component({ subject, props }) {
    return <SpringEntranceLayer props={props}>{subject}</SpringEntranceLayer>;
  },
  preview() {
    return { representativeProgress: 0.3, priority: "primary" };
  },
  designPreview() {
    return {
      props: {},
      subject: (
        <div
          style={{
            width: 620,
            height: 220,
            display: "flex",
            alignItems: "center",
            gap: 30,
            color: "#e2e8f0",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          }}
        >
          <img
            src={placeholderImageUrl}
            width={190}
            height={190}
            style={{
              width: 190,
              height: 190,
              objectFit: "cover",
              borderRadius: 28,
              boxShadow: "0 24px 64px rgba(0,0,0,.38)",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ color: "#a5b4fc", fontSize: 13, fontWeight: 700, letterSpacing: 2.6 }}>SPRING BRAKE</div>
            <div style={{ marginTop: 12, fontSize: 38, fontWeight: 720, lineHeight: 1.03, letterSpacing: -1.5 }}>Rush. Overshoot. Settle.</div>
            <div style={{ marginTop: 14, color: "#aeb9cc", fontSize: 16, lineHeight: 1.5 }}>Fast momentum, followed by a restrained spring brake.</div>
          </div>
        </div>
      ),
      composition: { width: 900, height: 500, durationSeconds: 3 },
      player: { loop: true },
    };
  },
});

export default SpringEntranceMotion;
