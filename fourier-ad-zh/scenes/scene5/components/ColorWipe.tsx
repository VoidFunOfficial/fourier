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

export const colorWipeSchema = defineSchema({
  orientation: field.enum(["landscape", "portrait"] as const, {
    label: "Landscape / portrait",
    description: "Sweep horizontally in landscape or vertically in portrait.",
    default: "landscape",
  }),
  direction: field.enum(["forward", "reverse"] as const, {
    label: "Direction",
    description: "Choose the wipe travel direction.",
    default: "forward",
  }),
  color: field.color({ label: "Primary color", default: "#6d28d9" }),
  secondaryColor: field.color({ label: "Secondary color", default: "#ec4899" }),
  accentColor: field.color({ label: "Accent color", default: "#22d3ee" }),
  layers: field.number({
    label: "Layer count",
    description: "The palette cycles through three colors.",
    min: 1,
    max: 8,
    integer: true,
    default: 4,
  }),
  stagger: field.number({
    label: "Layer stagger",
    description: "Zero moves all layers together; one uses maximum delay.",
    min: 0,
    max: 1,
    default: 0.72,
  }),
  hold: field.number({
    label: "Center hold",
    description: "How long the primary color covers the frame.",
    min: 0,
    max: 0.16,
    default: 0.055,
  }),
  edgeSlant: field.number({
    label: "Edge slant",
    min: 0,
    max: 10,
    default: 4,
  }),
  easing: field.enum(["smooth", "snappy", "linear"] as const, {
    label: "Easing",
    default: "smooth",
  }),
});

export type ColorWipeProps = InferFields<typeof colorWipeSchema>;

type WipeAxis = "horizontal" | "vertical";

const MAX_STAGGER_SPAN = 0.28;
const TRAVEL_SPAN = 0.26;

function wipeTransform(
  axis: WipeAxis,
  amount: string,
): Pick<FourierMotionTarget, "x" | "y"> {
  return axis === "horizontal" ? { x: amount, y: 0 } : { x: 0, y: amount };
}

/** Deterministic keyframes shared by previews, tests, and production renders. */
export function colorWipeLayerFrames(
  index: number,
  layerCount: number,
  axis: WipeAxis,
  direction: ColorWipeProps["direction"],
  stagger: number,
  hold: number,
): readonly FourierMotionTarget[] {
  const count = Math.max(1, Math.floor(layerCount));
  const safeIndex = Math.min(count - 1, Math.max(0, Math.floor(index)));
  const totalStagger = count === 1 ? 0 : MAX_STAGGER_SPAN * stagger;
  const center = count === 1
    ? 0.5
    : 0.5 - totalStagger + totalStagger * safeIndex / (count - 1);
  const startOffset = Math.max(0, center - TRAVEL_SPAN);
  const holdEnd = Math.min(0.76, center + hold);
  const endOffset = Math.min(1, holdEnd + TRAVEL_SPAN);
  const start = direction === "forward" ? "-112%" : "112%";
  const end = direction === "forward" ? "112%" : "-112%";
  const frames: FourierMotionTarget[] = [
    { ...wipeTransform(axis, start), offset: 0 },
  ];

  if (startOffset > 0) {
    frames.push({ ...wipeTransform(axis, start), offset: startOffset });
  }
  frames.push({ ...wipeTransform(axis, "0%"), offset: center });
  if (holdEnd > center) {
    frames.push({ ...wipeTransform(axis, "0%"), offset: holdEnd });
  }
  frames.push({ ...wipeTransform(axis, end), offset: endOffset });
  if (endOffset < 1) {
    frames.push({ ...wipeTransform(axis, end), offset: 1 });
  }
  return frames;
}

function layerColor(index: number, layerCount: number, props: ColorWipeProps): string {
  const palette = [props.color, props.secondaryColor, props.accentColor] as const;
  const distanceFromTop = layerCount - 1 - index;
  return palette[distanceFromTop % palette.length] ?? props.color;
}

function clipPath(axis: WipeAxis, direction: ColorWipeProps["direction"], slant: number): string {
  if (slant === 0) return "none";
  if (axis === "horizontal") {
    return direction === "forward"
      ? `polygon(${slant}% 0, 100% 0, ${100 - slant}% 100%, 0 100%)`
      : `polygon(0 0, ${100 - slant}% 0, 100% 100%, ${slant}% 100%)`;
  }
  return direction === "forward"
    ? `polygon(0 ${slant}%, 100% 0, 100% ${100 - slant}%, 0 100%)`
    : `polygon(0 0, 100% ${slant}%, 100% 100%, 0 ${100 - slant}%)`;
}

function layerStyle(
  axis: WipeAxis,
  direction: ColorWipeProps["direction"],
  color: string,
  slant: number,
): CSSProperties {
  return {
    position: "absolute",
    ...(axis === "horizontal"
      ? { inset: "0 -15%" }
      : { inset: "-15% 0" }),
    display: "block",
    background: color,
    clipPath: clipPath(axis, direction, slant),
    willChange: "transform",
  };
}

function transitionEase(easing: ColorWipeProps["easing"]): string | readonly [number, number, number, number] {
  if (easing === "linear") return "linear";
  if (easing === "snappy") return [0.76, 0, 0.24, 1] as const;
  return [0.65, 0, 0.35, 1] as const;
}

function ColorWipeLayer({ props }: { props: ColorWipeProps }) {
  const { width, height } = useFourierContext();
  const axis: WipeAxis = props.orientation === "landscape" ? "horizontal" : "vertical";

  return (
    <FourierMotion>
      <div
        aria-label="Color wipe transition"
        style={{
          position: "relative",
          width,
          height,
          overflow: "hidden",
          border: "2px solid #25242b",
          background: "transparent",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "#25242b",
            fontFamily: "Inter, Arial, sans-serif",
            textAlign: "center",
          }}
        >
          <div style={{ position: "absolute", left: 26, right: 26, top: 24, color: "#6f5cff", fontSize: 13, fontWeight: 760, letterSpacing: ".18em", textTransform: "uppercase", textAlign: "left" }}>
            ColorWipe
          </div>
          <div>
            <div style={{ fontSize: 34, fontWeight: 650, letterSpacing: "-.045em" }}>
          无缝转场
            </div>
            <div style={{ marginTop: 12, fontSize: 15, color: "#716e70" }}>
          色彩分层，时机精准。
            </div>
          </div>
        </div>
        {Array.from({ length: props.layers }, (_, index) => (
          <motion.div
            key={index}
            aria-hidden="true"
            animate={colorWipeLayerFrames(
              index,
              props.layers,
              axis,
              props.direction,
              props.stagger,
              props.hold,
            )}
            transition={{ ease: transitionEase(props.easing) }}
            style={{
              ...layerStyle(
                axis,
                props.direction,
                layerColor(index, props.layers, props),
                props.edgeSlant,
              ),
              zIndex: index + 1,
            }}
          />
        ))}
      </div>
    </FourierMotion>
  );
}

export const ColorWipe = defineReact({
  name: "ColorWipe",
  schema: colorWipeSchema,
  component({ props }) {
    return <ColorWipeLayer props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 2 },
      player: { background: "checkerboard", loop: true },
    };
  },
});

export default ColorWipe;
