import taglineFontUrl from "../assets/Montserrat-Medium.ttf";
import {
  FourierMotion,
  defineReact,
  defineSchema,
  field,
  loadFont,
  motion,
  useFourierContext,
  type FourierMotionTarget,
} from "@fourier-video/sdk";

const taglineFont = loadFont(taglineFontUrl);

const taglineSchema = defineSchema({
  text: field.string({
    label: "Tagline",
    default: "NATIVE AGENT VIDEO PROJECT RUNTIME",
  }),
  color: field.color({ label: "Text color", default: "#f4efe4" }),
  fontSize: field.number({
    label: "Font size",
    min: 16,
    max: 64,
    default: 28,
  }),
  centerY: field.number({
    label: "Vertical center",
    min: 0,
    max: 1_080,
    default: 790,
  }),
});

const taglineFrames: readonly FourierMotionTarget[] = [
  { opacity: 0, y: 18, offset: 0 },
  { opacity: 1, y: 0, offset: 0.72 },
  { opacity: 1, y: 0, offset: 1 },
];

function RuntimeTagline({
  text,
  color,
  fontSize,
  centerY,
}: {
  readonly text: string;
  readonly color: string;
  readonly fontSize: number;
  readonly centerY: number;
}) {
  const { width, height } = useFourierContext();

  return (
    <FourierMotion>
      <div
        style={{
          position: "relative",
          width,
          height,
          overflow: "hidden",
          background: "transparent",
          pointerEvents: "none",
        }}
      >
        <motion.div
          aria-label={text}
          animate={taglineFrames}
          transition={{ ease: [0.16, 1, 0.3, 1], fill: "both" }}
          style={{
            position: "absolute",
            left: 0,
            top: centerY - fontSize,
            width: "100%",
            height: fontSize * 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
            color,
            fontFamily: taglineFont,
            fontSize,
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: 2.8,
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          {text}
        </motion.div>
      </div>
    </FourierMotion>
  );
}

export default defineReact({
  name: "SceneTenRuntimeTagline",
  schema: taglineSchema,
  component({ props }) {
    return <RuntimeTagline {...props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1_920, height: 1_080, durationSeconds: 2 },
      player: { background: "#28362e", loop: true },
    };
  },
});
