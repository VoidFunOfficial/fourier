import {
  FourierMotion,
  defineReact,
  defineSchema,
  field,
  motion,
  useFourierContext,
  type FourierMotionTarget,
  type InferFields,
} from "@fourier-video/sdk";

export const DEFAULT_COLOR_WAVE_PALETTE = [
  "#f4efe4",
  "#f2c14e",
  "#e07a5f",
  "#d95d39",
  "#f29f05",
  "#28362e",
  "#81b29a",
  "#3d6b55",
  "#c9ada1",
  "#7f5539",
  "#202820",
] as const;

export const colorWaveWipeSchema = defineSchema({
  count: field.number({
    label: "Color bar count",
    description: "The number of solid-color bars in the left-to-right wipe.",
    min: 5,
    max: DEFAULT_COLOR_WAVE_PALETTE.length,
    integer: true,
    default: DEFAULT_COLOR_WAVE_PALETTE.length,
  }),
  color1: field.color({ label: "Color 1", default: DEFAULT_COLOR_WAVE_PALETTE[0] }),
  color2: field.color({ label: "Color 2", default: DEFAULT_COLOR_WAVE_PALETTE[1] }),
  color3: field.color({ label: "Color 3", default: DEFAULT_COLOR_WAVE_PALETTE[2] }),
  color4: field.color({ label: "Color 4", default: DEFAULT_COLOR_WAVE_PALETTE[3] }),
  color5: field.color({ label: "Color 5", default: DEFAULT_COLOR_WAVE_PALETTE[4] }),
  color6: field.color({ label: "Color 6", default: DEFAULT_COLOR_WAVE_PALETTE[5] }),
  color7: field.color({ label: "Color 7", default: DEFAULT_COLOR_WAVE_PALETTE[6] }),
  color8: field.color({ label: "Color 8", default: DEFAULT_COLOR_WAVE_PALETTE[7] }),
  color9: field.color({ label: "Color 9", default: DEFAULT_COLOR_WAVE_PALETTE[8] }),
  color10: field.color({ label: "Color 10", default: DEFAULT_COLOR_WAVE_PALETTE[9] }),
  color11: field.color({ label: "Color 11", default: DEFAULT_COLOR_WAVE_PALETTE[10] }),
  shortestLength: field.number({
    label: "Shortest initial bar length (%)",
    description: "The exposed width of the shortest center bar before every bar reaches 100%.",
    min: 0,
    max: 30,
    default: 1,
  }),
  blurRadius: field.number({
    label: "Blur radius",
    description: "The standard CSS blur applied directly to the color bars, in pixels.",
    min: 0,
    max: 48,
    default: 24,
  }),
});

export type ColorWaveWipeProps = InferFields<typeof colorWaveWipeSchema>;

export const COLOR_WAVE_WIPE_LONGEST_LENGTH = 92;
export const COLOR_WAVE_WIPE_MAX_LENGTH_STEP = 20;
const MAX_TRAVEL_SPAN = 0.19;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function colorWaveWipeColors(
  props: ColorWaveWipeProps,
): readonly string[] {
  const colors = [
    props.color1,
    props.color2,
    props.color3,
    props.color4,
    props.color5,
    props.color6,
    props.color7,
    props.color8,
    props.color9,
    props.color10,
    props.color11,
  ];
  return colors.slice(0, clamp(Math.floor(props.count), 5, colors.length));
}

/** Returns a top-to-bottom long -> short -> long profile. */
export function colorWaveWipeBarLength(
  index: number,
  barCount: number,
  shortestLength: number,
): number {
  const count = Math.max(1, Math.floor(barCount));
  const safeIndex = clamp(Math.floor(index), 0, count - 1);
  const shortest = clamp(shortestLength, 0, COLOR_WAVE_WIPE_LONGEST_LENGTH);
  if (count <= 2) return shortest;

  const midpoint = (count - 1) / 2;
  const centerDistance = count % 2 === 0 ? 0.5 : 0;
  const distance = Math.abs(safeIndex - midpoint);
  const stepsFromCenter = distance - centerDistance;
  return Math.min(
    COLOR_WAVE_WIPE_LONGEST_LENGTH,
    shortest + stepsFromCenter * COLOR_WAVE_WIPE_MAX_LENGTH_STEP,
  );
}

export function colorWaveWipeBarFrames(
  index: number,
  barCount: number,
  shortestLength: number,
): readonly FourierMotionTarget[] {
  const count = Math.max(1, Math.floor(barCount));
  const safeIndex = clamp(Math.floor(index), 0, count - 1);
  const initialLength = colorWaveWipeBarLength(safeIndex, count, shortestLength);
  const shortest = clamp(shortestLength, 0, COLOR_WAVE_WIPE_LONGEST_LENGTH);
  const profileSpan = Math.max(1, COLOR_WAVE_WIPE_LONGEST_LENGTH - shortest);
  const leadingProfile = clamp(
    (initialLength - shortest) / profileSpan,
    0,
    1,
  );
  const startOffset = (1 - leadingProfile) * 0.055;
  const arrivalOffset = 0.12 + (1 - leadingProfile) * (MAX_TRAVEL_SPAN - 0.12);

  return [
    { scaleX: 0, offset: 0 },
    { scaleX: 0, offset: startOffset },
    { scaleX: 1, offset: arrivalOffset },
    { scaleX: 1, offset: 1 },
  ];
}

function ColorWaveWipeLayer({ props }: { props: ColorWaveWipeProps }) {
  const { width, height } = useFourierContext();
  const colors = colorWaveWipeColors(props);

  return (
    <FourierMotion>
      <div
        role="img"
        aria-label="Solid color wave wiping in from the left"
        style={{
          position: "relative",
          width,
          height,
          overflow: "hidden",
          background: "transparent",
          pointerEvents: "none",
        }}
      >
        <div
          data-color-wave-blur=""
          style={{
            position: "absolute",
            inset: -props.blurRadius,
            display: "flex",
            flexDirection: "column",
            filter: `blur(${props.blurRadius}px)`,
            willChange: "filter",
          }}
        >
          {colors.map((color, index) => (
            <motion.div
              key={`${index}:${color}`}
              data-color-wave-bar={index + 1}
              aria-hidden="true"
              animate={colorWaveWipeBarFrames(index, colors.length, props.shortestLength)}
              transition={{ ease: [0.22, 0.9, 0.24, 1], fill: "both" }}
              style={{
                width: "100%",
                minHeight: 0,
                flex: "1 1 0",
                background: color,
                transformOrigin: "0% 50%",
                willChange: "transform",
              }}
            />
          ))}
        </div>
      </div>
    </FourierMotion>
  );
}

export const ColorWaveWipe = defineReact({
  name: "ColorWaveWipe",
  schema: colorWaveWipeSchema,
  component({ props }) {
    return <ColorWaveWipeLayer props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 3 },
      player: { background: "checkerboard", loop: true },
    };
  },
});

export default ColorWaveWipe;
