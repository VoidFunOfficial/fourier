/** @jsxRuntime classic */
/** @jsx React.createElement */

import {
  FourierMotion,
  React,
  defineReact,
  defineSchema,
  field,
  motion,
  useFourierContext,
  type FourierMotionTarget,
  type InferFields,
} from "@fourier-video/sdk";

export const BEN_JITTER_DURATION_SECONDS = 4;
export const BEN_JITTER_HZ = 12;
export const BEN_JITTER_AMPLITUDE = 1;
export const BEN_JITTER_SCALE = 1.01;

export const analogFrameJitterSchema = defineSchema({
  title: field.string({ label: "标题", default: "ANALOG MEMORY" }),
  background: field.color({ label: "背景", default: "#151515" }),
  paper: field.color({ label: "纸张", default: "#EAE4D7" }),
  ink: field.color({ label: "油墨", default: "#171717" }),
  accent: field.color({ label: "强调", default: "#E5543D" }),
});
export type AnalogFrameJitterProps = InferFields<typeof analogFrameJitterSchema>;

function jitterSample(sample: number, salt: number): number {
  return (((sample + 5) * 47 + salt * 31) % 5) / 2 - 1;
}

export function benAnalogJitterFrames(): readonly FourierMotionTarget[] {
  const count = BEN_JITTER_DURATION_SECONDS * BEN_JITTER_HZ;
  return Array.from({ length: count + 1 }, (_, sample) => {
    const wrapped = sample === count ? 0 : sample;
    return {
      x: jitterSample(wrapped, 1) * BEN_JITTER_AMPLITUDE,
      y: jitterSample(wrapped, 3) * BEN_JITTER_AMPLITUDE,
      rotate: jitterSample(wrapped, 7) * 0.08,
      scale: BEN_JITTER_SCALE,
      offset: sample / count,
    };
  });
}

function AnalogFrameJitterLayer({ props }: { readonly props: AnalogFrameJitterProps }) {
  const { width, height } = useFourierContext();
  const scale = Math.min(width / 1920, height / 1080);
  return (
    <FourierMotion>
      <div
        aria-label="Ben Marriott whole-frame analog jitter"
        data-ben-analog-jitter=""
        data-jitter-hz={BEN_JITTER_HZ}
        data-amplitude={BEN_JITTER_AMPLITUDE}
        style={{ position: "relative", width, height, overflow: "hidden", background: props.background }}
      >
        <motion.div
          animate={benAnalogJitterFrames()}
          transition={{ ease: "linear", fill: "both" }}
          style={{
            position: "absolute",
            left: 238 * scale,
            top: 122 * scale,
            width: 1444 * scale,
            height: 836 * scale,
            overflow: "hidden",
            background: props.paper,
            color: props.ink,
            boxShadow: 28 * scale + "px " + 34 * scale + "px 0 rgba(0,0,0,.36)",
            willChange: "transform",
          }}
        >
          <div style={{ position: "absolute", left: 84 * scale, top: 72 * scale, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 18 * scale, fontWeight: 700, letterSpacing: "0.25em" }}>ARCHIVE 12 / 24</div>
          <div style={{ position: "absolute", left: 80 * scale, top: 238 * scale, fontFamily: "Arial Black, Arial, sans-serif", fontSize: 154 * scale, fontWeight: 900, lineHeight: 0.8, letterSpacing: "-0.07em", maxWidth: 1120 * scale }}>{props.title}</div>
          <div style={{ position: "absolute", right: -110 * scale, bottom: -140 * scale, width: 720 * scale, height: 720 * scale, borderRadius: "50%", background: props.accent }} />
          <div style={{ position: "absolute", left: 82 * scale, right: 82 * scale, bottom: 70 * scale, height: 4 * scale, background: props.ink }} />
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, opacity: 0.08, background: "repeating-linear-gradient(0deg, transparent 0 5px, " + props.ink + " 6px 7px)" }} />
        </motion.div>
      </div>
    </FourierMotion>
  );
}

const AnalogFrameJitter = defineReact({
  name: "BenMarriottAnalogFrameJitter",
  schema: analogFrameJitterSchema,
  component({ props }) {
    return <AnalogFrameJitterLayer props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, fps: 60, durationSeconds: BEN_JITTER_DURATION_SECONDS },
      player: { background: "#151515", loop: true },
    };
  },
});

export default AnalogFrameJitter;
