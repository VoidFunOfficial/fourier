import dropFontUrl from "../assets/Montserrat-Black.ttf";
import {
  FourierMotion,
  defineReact,
  defineSchema,
  field,
  loadFont,
  motion,
  useFourierContext,
  type CSSProperties,
  type FourierMotionTarget,
  type InferFields,
} from "@fourier-video/sdk";

export const MAX_COLOR_DROP_BLOCKS = 4;
const dropFont = loadFont(dropFontUrl);

export const colorDropIntroSchema = defineSchema({
  count: field.number({
    label: "Color block count",
    description: "Split the canvas into the requested number of vertical color blocks.",
    min: 1,
    max: MAX_COLOR_DROP_BLOCKS,
    integer: true,
    default: 4,
  }),
  color1: field.color({ label: "Color 1", default: "#f4efe4" }),
  color2: field.color({ label: "Color 2", default: "#f2c14e" }),
  color3: field.color({ label: "Color 3", default: "#e07a5f" }),
  color4: field.color({ label: "Color 4", default: "#28362e" }),
  label1: field.string({ label: "Label 1", default: "Render Engine" }),
  label2: field.string({ label: "Label 2", default: "SDK" }),
  label3: field.string({ label: "Label 3", default: "Tools" }),
  label4: field.string({ label: "Label 4", default: "World" }),
  background: field.color({ label: "Background", default: "transparent" }),
  gap: field.number({
    label: "Block gap",
    min: 0,
    max: 32,
    integer: true,
    default: 0,
  }),
  padding: field.number({
    label: "Content padding",
    min: 12,
    max: 96,
    integer: true,
    default: 48,
  }),
  contentAlign: field.enum(["top", "center", "bottom"] as const, {
    label: "Content position",
    default: "center",
  }),
  dropDuration: field.number({
    label: "Block drop duration (seconds)",
    min: 0.45,
    max: 2.4,
    default: 1.15,
  }),
  brakeIntensity: field.number({
    label: "Brake intensity",
    description: "Controls the vertical compression and rebound on impact.",
    min: 0,
    max: 1,
    default: 0.82,
  }),
});

export type ColorDropIntroProps = InferFields<typeof colorDropIntroSchema>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function colorDropBlockFrames(
  brakeIntensity = 0.82,
): readonly FourierMotionTarget[] {
  const brake = clamp(brakeIntensity, 0, 1);
  const impactStretch = 1 + brake * 0.072;
  const compression = 1 - brake * 0.105;
  const rebound = 1 + brake * 0.034;
  const correction = 1 - brake * 0.009;

  return [
    {
      y: "-112%",
      scaleY: 1,
      offset: 0,
      easing: "cubic-bezier(0.55, 0.03, 0.92, 0.36)",
    },
    {
      y: "-18%",
      scaleY: 1.018,
      offset: 0.7,
      easing: "cubic-bezier(0.45, 0, 0.95, 0.42)",
    },
    {
      y: "0%",
      scaleY: impactStretch,
      offset: 0.765,
      easing: "cubic-bezier(0.12, 0.86, 0.2, 1)",
    },
    { y: "0%", scaleY: compression, offset: 0.79 },
    {
      y: "0%",
      scaleY: rebound,
      offset: 0.845,
      easing: "cubic-bezier(0.2, 0.78, 0.24, 1)",
    },
    { y: "0%", scaleY: correction, offset: 0.91 },
    { y: "0%", scaleY: 1, offset: 0.965 },
    { y: "0%", scaleY: 1, offset: 1 },
  ];
}

function readableForeground(background: string): "#111318" | "#ffffff" {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(background.trim());
  if (match === null) return "#111318";
  const [red, green, blue] = match.slice(1).map((part) => Number.parseInt(part!, 16));
  const luminance = (red! * 0.299 + green! * 0.587 + blue! * 0.114) / 255;
  return luminance > 0.58 ? "#111318" : "#ffffff";
}

function contentJustification(
  alignment: ColorDropIntroProps["contentAlign"],
): CSSProperties["justifyContent"] {
  if (alignment === "top") return "flex-start";
  if (alignment === "center") return "center";
  return "flex-end";
}

function palette(props: ColorDropIntroProps): readonly string[] {
  return [props.color1, props.color2, props.color3, props.color4];
}

function labels(props: ColorDropIntroProps): readonly string[] {
  return [props.label1, props.label2, props.label3, props.label4];
}

function BlockLabel({ index, label }: { index: number; label: string }) {
  const words = label.split(/\s+/).filter((word) => word.length > 0);
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          marginBottom: 28,
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: 4.8,
          opacity: 0.58,
        }}
      >
        {String(index + 1).padStart(2, "0")} / FOURIER
      </div>
      <div
        aria-label={label}
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 78,
          fontWeight: 900,
          lineHeight: 0.9,
          letterSpacing: -4.5,
          textTransform: "uppercase",
        }}
      >
        {words.map((word) => <span key={word}>{word}</span>)}
      </div>
      <div
        aria-hidden="true"
        style={{
          width: 56,
          height: 7,
          marginTop: 34,
          background: "currentColor",
          opacity: 0.82,
        }}
      />
    </div>
  );
}

function ColorDropIntroLayer({ props }: { props: ColorDropIntroProps }) {
  const { width, height } = useFourierContext();
  const blockCount = clamp(Math.floor(props.count), 1, MAX_COLOR_DROP_BLOCKS);
  const colors = palette(props).slice(0, blockCount);
  const blockLabels = labels(props).slice(0, blockCount);

  return (
    <FourierMotion>
      <div
        role="group"
        aria-label="Fourier runtime modules"
        style={{
          position: "relative",
          width,
          height,
          display: "grid",
          gridTemplateColumns: `repeat(${blockCount}, minmax(0, 1fr))`,
          gap: props.gap,
          overflow: "hidden",
          background: props.background,
          isolation: "isolate",
        }}
      >
        {blockLabels.map((label, index) => {
          const color = colors[index]!;
          return (
            <motion.div
              key={`${index}:${label}`}
              data-color-drop-block={index + 1}
              aria-label={label}
              animate={colorDropBlockFrames(props.brakeIntensity)}
              transition={{
                duration: props.dropDuration,
                ease: "linear",
                fill: "both",
              }}
              style={{
                position: "relative",
                minWidth: 0,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: contentJustification(props.contentAlign),
                overflow: "hidden",
                padding: props.padding,
                color: readableForeground(color),
                background: color,
                borderLeft: index === 0 ? "none" : "2px solid rgba(17,19,24,0.16)",
                fontFamily: dropFont,
                transformOrigin: "50% 100%",
                willChange: "transform",
              }}
            >
              <BlockLabel index={index} label={label} />
            </motion.div>
          );
        })}
      </div>
    </FourierMotion>
  );
}

export const ColorDropIntro = defineReact({
  name: "ColorDropIntro",
  schema: colorDropIntroSchema,
  component({ props }) {
    return <ColorDropIntroLayer props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 3 },
      player: { background: "#171a16", loop: true },
    };
  },
});

export default ColorDropIntro;
