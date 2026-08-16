import {
  FourierMotion,
  defineReact,
  defineSchema,
  field,
  motion,
  useFourierContext,
  type FieldDefinition,
  type FourierMotionTarget,
  type InferFields,
} from "@fourier-video/sdk";

export const DEFAULT_COLOR_WAVE_PALETTE = [
  "#ff4d6d",
  "#ff9f1c",
  "#ffe66d",
  "#2ec4b6",
  "#4361ee",
] as const;

const colorListField = field.node({
  label: "颜色列表",
  description: "传入 string[]；每个颜色对应一根长方条，并决定长方条数量。",
}) as FieldDefinition<readonly string[], readonly string[], false>;

export const colorWaveWipeSchema = defineSchema({
  colors: colorListField,
  shortestLength: field.number({
    label: "最短条长度（%）",
    description: "入场时中间长方条露出的画布宽度；最终所有条都达到 100%。",
    min: 0,
    max: 30,
    default: 1,
  }),
});

export type ColorWaveWipeProps = InferFields<typeof colorWaveWipeSchema>;

export const COLOR_WAVE_WIPE_LONGEST_LENGTH = 92;
export const COLOR_WAVE_WIPE_MAX_LENGTH_STEP = 20;
const MAX_TRAVEL_SPAN = 0.12;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function colorWaveWipeColors(
  colors: readonly string[],
): readonly string[] {
  const normalized = colors
    .map((color) => color.trim())
    .filter((color) => color.length > 0);
  return normalized.length > 0 ? normalized : DEFAULT_COLOR_WAVE_PALETTE;
}

/**
 * Returns a top-to-bottom long -> short -> long profile. Odd and even bar
 * counts both share an exactly mirrored center.
 */
export function colorWaveWipeBarLength(
  index: number,
  barCount: number,
  shortestLength: number,
): number {
  const count = Math.max(1, Math.floor(barCount));
  const safeIndex = clamp(Math.floor(index), 0, count - 1);
  const shortest = clamp(
    shortestLength,
    0,
    COLOR_WAVE_WIPE_LONGEST_LENGTH,
  );
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
  const initialLength = colorWaveWipeBarLength(
    safeIndex,
    count,
    shortestLength,
  );
  const travel = 100 - initialLength;
  const maximumTravel = 100 - clamp(
    shortestLength,
    0,
    COLOR_WAVE_WIPE_LONGEST_LENGTH,
  );
  const arrivalOffset = maximumTravel === 0
    ? 0
    : MAX_TRAVEL_SPAN * travel / maximumTravel;

  return [
    { scaleX: initialLength / 100, offset: 0 },
    { scaleX: 1, offset: arrivalOffset },
    { scaleX: 1, offset: 1 },
  ];
}

function ColorWaveWipeLayer({ props }: { props: ColorWaveWipeProps }) {
  const { width, height } = useFourierContext();
  const colors = colorWaveWipeColors(props.colors);

  return (
    <FourierMotion>
      <div
        role="img"
        aria-label="Color wave wipe"
        style={{
          position: "relative",
          width,
          height,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "transparent",
          pointerEvents: "none",
        }}
      >
        {colors.map((color, index) => {
          return (
            <motion.div
              key={index}
              data-color-wave-bar={index + 1}
              aria-hidden="true"
              animate={colorWaveWipeBarFrames(
                index,
                colors.length,
                props.shortestLength,
              )}
              transition={{ ease: "linear", fill: "both" }}
              style={{
                width: "100%",
                minHeight: 0,
                flex: "1 1 0",
                background: color,
                transformOrigin: "0% 50%",
                willChange: "transform",
              }}
            />
          );
        })}
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
      props: { colors: DEFAULT_COLOR_WAVE_PALETTE },
      composition: { width: 960, height: 540, durationSeconds: 3 },
      player: { background: "checkerboard", loop: true },
    };
  },
});

export default ColorWaveWipe;
