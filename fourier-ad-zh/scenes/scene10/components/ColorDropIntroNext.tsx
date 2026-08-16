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
import {
  MAX_COLOR_DROP_BLOCKS,
  colorDropBlockFrames,
  colorDropIntroSchema,
} from "./ColorDropIntro.tsx";

const dropFont = loadFont(dropFontUrl);

export const colorDropIntroNextSchema = defineSchema({
  ...colorDropIntroSchema,
  selectedBlock: field.number({
    label: "Expanded block",
    description: "One-based index of the block that expands to fill the canvas.",
    min: 1,
    max: MAX_COLOR_DROP_BLOCKS,
    integer: true,
    default: 1,
  }),
  settlePause: field.number({
    label: "Settle pause (seconds)",
    description: "The pause between the landing impact and the expansion collision.",
    min: 0,
    max: 1.2,
    default: 0.18,
  }),
  expandDuration: field.number({
    label: "Expansion duration (seconds)",
    min: 0.45,
    max: 2.2,
    default: 0.95,
  }),
  collisionStrength: field.number({
    label: "Collision strength",
    description: "Controls compression, overshoot, and anticipation during expansion.",
    min: 0,
    max: 1,
    default: 0.82,
  }),
  collisionWave: field.number({
    label: "Collision propagation (seconds)",
    description: "Adds a small distance-based delay to displaced blocks.",
    min: 0,
    max: 0.18,
    default: 0.04,
  }),
});

export type ColorDropIntroNextProps = InferFields<
  typeof colorDropIntroNextSchema
>;

export interface ColorDropNextTimelineOptions {
  readonly index: number;
  readonly count: number;
  readonly selectedIndex: number;
  readonly width: number;
  readonly gap: number;
  readonly dropDuration: number;
  readonly settlePause: number;
  readonly expandDuration: number;
  readonly collisionStrength: number;
  readonly collisionWave: number;
  readonly brakeIntensity: number;
}

export interface ColorDropNextTimeline {
  readonly durationSeconds: number;
  readonly expansionStartSeconds: number;
  readonly blockWidth: number;
  readonly initialLeft: number;
  readonly selected: boolean;
  readonly frames: readonly FourierMotionTarget[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function at(value: number, duration: number): number {
  return clamp(value / duration, 0, 1);
}

function pixels(value: number): string {
  return `${Number(value.toFixed(3))}px`;
}

function withoutOffset(
  frame: FourierMotionTarget,
): Omit<FourierMotionTarget, "offset"> {
  const { offset: _offset, ...target } = frame;
  return target;
}

function remappedDropFrames(
  dropDuration: number,
  brakeIntensity: number,
  timelineDuration: number,
): FourierMotionTarget[] {
  return colorDropBlockFrames(brakeIntensity).map((frame) => ({
    ...withoutOffset(frame),
    offset: at((frame.offset ?? 0) * dropDuration, timelineDuration),
  }));
}

function selectedExpansionFrames(
  start: number,
  duration: number,
  timelineDuration: number,
  initialLeft: number,
  blockWidth: number,
  canvasWidth: number,
  collisionStrength: number,
): FourierMotionTarget[] {
  const force = clamp(collisionStrength, 0, 1);
  const frame = (
    phase: number,
    left: number,
    width: number,
    extra: FourierMotionTarget = {},
  ): FourierMotionTarget => ({
    x: 0,
    y: "0%",
    scaleX: 1,
    scaleY: 1,
    left: pixels(left),
    width: pixels(width),
    offset: at(start + phase * duration, timelineDuration),
    ...extra,
  });

  const anticipationWidth = blockWidth * (1 - force * 0.085);
  const anticipationLeft = initialLeft + (blockWidth - anticipationWidth) / 2;
  const firstImpactWidth = blockWidth
    + (canvasWidth - blockWidth) * (0.19 + force * 0.05);
  const firstImpactLeft = initialLeft * 0.76 - blockWidth * force * 0.025;
  const midWidth = blockWidth + (canvasWidth - blockWidth) * 0.72;
  const midLeft = initialLeft * 0.3;

  return [
    frame(0, initialLeft, blockWidth),
    frame(0.1, anticipationLeft, anticipationWidth, {
      easing: "cubic-bezier(0.5, 0, 0.72, 0.34)",
    }),
    frame(0.27, firstImpactLeft, firstImpactWidth, {
      easing: "cubic-bezier(0.12, 0.82, 0.18, 1)",
    }),
    frame(0.58, midLeft, midWidth),
    frame(
      0.86,
      -canvasWidth * 0.012 * force,
      canvasWidth * (1 + 0.024 * force),
      { easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    ),
    frame(1, 0, canvasWidth),
  ];
}

function pushedExpansionFrames(
  start: number,
  duration: number,
  timelineDuration: number,
  distance: number,
  initialLeft: number,
  blockWidth: number,
  canvasWidth: number,
  collisionStrength: number,
): FourierMotionTarget[] {
  const force = clamp(collisionStrength, 0, 1);
  const finalX = canvasWidth - initialLeft + Math.max(2, canvasWidth * 0.012);
  const distanceFalloff = 1 / (1 + Math.max(0, distance - 1) * 0.14);
  const squeeze = 1 - force * 0.16 * distanceFalloff;
  const bulge = 1 + force * 0.026 * distanceFalloff;
  const frame = (
    phase: number,
    x: number,
    scaleX: number,
    extra: FourierMotionTarget = {},
  ): FourierMotionTarget => ({
    x,
    y: "0%",
    scaleX,
    scaleY: 1,
    left: pixels(initialLeft),
    width: pixels(blockWidth),
    offset: at(start + phase * duration, timelineDuration),
    ...extra,
  });

  return [
    frame(0, 0, 1),
    frame(0.12, blockWidth * 0.045 * force, bulge, {
      easing: "cubic-bezier(0.44, 0, 0.7, 0.38)",
    }),
    frame(0.29, finalX * (0.17 + force * 0.07), squeeze, {
      easing: "cubic-bezier(0.12, 0.78, 0.2, 1)",
    }),
    frame(0.57, finalX * 0.58, 0.88 + (1 - force) * 0.07),
    frame(0.86, finalX * (1 + force * 0.035), 0.94),
    frame(1, finalX, 1),
  ];
}

/** Drops all blocks together, then expands the selected block with collision. */
export function colorDropNextTimeline(
  options: ColorDropNextTimelineOptions,
): ColorDropNextTimeline {
  const count = clamp(Math.floor(options.count), 1, MAX_COLOR_DROP_BLOCKS);
  const index = clamp(Math.floor(options.index), 0, count - 1);
  const selectedIndex = clamp(Math.floor(options.selectedIndex), 0, count - 1);
  const gap = clamp(options.gap, 0, Math.max(0, options.width / count / 2));
  const blockWidth = (options.width - gap * (count - 1)) / count;
  const initialLeft = index * (blockWidth + gap);
  const dropDuration = Math.max(0.001, options.dropDuration);
  const settlePause = Math.max(0, options.settlePause);
  const expandDuration = Math.max(0.001, options.expandDuration);
  const collisionWave = Math.max(0, options.collisionWave);
  const distance = Math.abs(index - selectedIndex);
  const maximumDistance = Math.max(selectedIndex, count - 1 - selectedIndex);
  const expansionStartSeconds = dropDuration + settlePause;
  const waveDelay = distance === 0 ? 0 : Math.max(0, distance - 1) * collisionWave;
  const durationSeconds = expansionStartSeconds
    + expandDuration
    + Math.max(0, maximumDistance - 1) * collisionWave;
  const panelExpansionStart = expansionStartSeconds + waveDelay;
  const frames = remappedDropFrames(
    dropDuration,
    options.brakeIntensity,
    durationSeconds,
  );
  const settledFrame: FourierMotionTarget = {
    x: 0,
    y: "0%",
    scaleX: 1,
    scaleY: 1,
    left: pixels(initialLeft),
    width: pixels(blockWidth),
    offset: at(expansionStartSeconds, durationSeconds),
  };
  frames.push(settledFrame);
  if (panelExpansionStart > expansionStartSeconds) {
    frames.push({
      ...settledFrame,
      offset: at(panelExpansionStart, durationSeconds),
    });
  }

  const selected = index === selectedIndex;
  frames.push(...(
    selected
      ? selectedExpansionFrames(
          panelExpansionStart,
          expandDuration,
          durationSeconds,
          initialLeft,
          blockWidth,
          options.width,
          options.collisionStrength,
        )
      : pushedExpansionFrames(
          panelExpansionStart,
          expandDuration,
          durationSeconds,
          distance,
          initialLeft,
          blockWidth,
          options.width,
          options.collisionStrength,
        )
  ));

  const last = frames.at(-1)!;
  if ((last.offset ?? 1) < 1) frames.push({ ...last, offset: 1 });

  return {
    durationSeconds,
    expansionStartSeconds,
    blockWidth,
    initialLeft,
    selected,
    frames,
  };
}

function foreground(background: string): "#111318" | "#ffffff" {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(background.trim());
  if (match === null) return "#111318";
  const [red, green, blue] = match.slice(1).map((part) => Number.parseInt(part!, 16));
  const luminance = (red! * 0.299 + green! * 0.587 + blue! * 0.114) / 255;
  return luminance > 0.58 ? "#111318" : "#ffffff";
}

function justifyContent(
  alignment: ColorDropIntroNextProps["contentAlign"],
): CSSProperties["justifyContent"] {
  if (alignment === "top") return "flex-start";
  if (alignment === "center") return "center";
  return "flex-end";
}

function palette(props: ColorDropIntroNextProps): readonly string[] {
  return [props.color1, props.color2, props.color3, props.color4];
}

function labels(props: ColorDropIntroNextProps): readonly string[] {
  return [props.label1, props.label2, props.label3, props.label4];
}

function blockLabel(label: string): readonly string[] {
  return label.split(/\s+/).filter((word) => word.length > 0);
}

function CollapsedBlockLabel({ index, label }: { index: number; label: string }) {
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
        {blockLabel(label).map((word) => <span key={word}>{word}</span>)}
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

function collapsedContentFrames(
  timeline: ColorDropNextTimeline,
  expandDuration: number,
): readonly FourierMotionTarget[] {
  const start = at(timeline.expansionStartSeconds, timeline.durationSeconds);
  const end = at(
    timeline.expansionStartSeconds + expandDuration * 0.34,
    timeline.durationSeconds,
  );
  return [
    { opacity: 1, scale: 1, offset: 0 },
    { opacity: 1, scale: 1, offset: start },
    { opacity: 0, scale: 0.94, offset: end },
    { opacity: 0, scale: 0.94, offset: 1 },
  ];
}

function ColorDropIntroNextLayer({ props }: { props: ColorDropIntroNextProps }) {
  const { width, height } = useFourierContext();
  const count = clamp(Math.floor(props.count), 1, MAX_COLOR_DROP_BLOCKS);
  const selectedIndex = clamp(Math.floor(props.selectedBlock) - 1, 0, count - 1);
  const colors = palette(props).slice(0, count);
  const blockLabels = labels(props).slice(0, count);

  return (
    <FourierMotion>
      <div
        role="group"
        aria-label="Fourier runtime modules with Render Engine expanding first"
        style={{
          position: "relative",
          width,
          height,
          overflow: "hidden",
          background: props.background,
          isolation: "isolate",
        }}
      >
        {blockLabels.map((label, index) => {
          const timeline = colorDropNextTimeline({
            index,
            count,
            selectedIndex,
            width,
            gap: props.gap,
            dropDuration: props.dropDuration,
            settlePause: props.settlePause,
            expandDuration: props.expandDuration,
            collisionStrength: props.collisionStrength,
            collisionWave: props.collisionWave,
            brakeIntensity: props.brakeIntensity,
          });
          const color = colors[index]!;

          return (
            <motion.div
              key={`${index}:${label}`}
              data-color-drop-next-block={index + 1}
              data-selected={timeline.selected ? "true" : "false"}
              aria-label={label}
              animate={timeline.frames}
              transition={{
                duration: timeline.durationSeconds,
                ease: "linear",
                fill: "both",
              }}
              style={{
                position: "absolute",
                left: timeline.initialLeft,
                top: 0,
                width: timeline.blockWidth,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: justifyContent(props.contentAlign),
                overflow: "hidden",
                padding: timeline.selected ? 0 : props.padding,
                color: foreground(color),
                background: color,
                borderLeft: index === 0 ? "none" : "2px solid rgba(17,19,24,0.16)",
                fontFamily: dropFont,
                transformOrigin: timeline.selected ? "50% 50%" : "0% 50%",
                zIndex: timeline.selected ? 10 : 3 + index,
                willChange: "transform, left, width",
              }}
            >
              {timeline.selected ? (
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  <motion.div
                    animate={collapsedContentFrames(timeline, props.expandDuration)}
                    transition={{ ease: "linear", fill: "both" }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      padding: props.padding,
                    }}
                  >
                    <CollapsedBlockLabel index={index} label={label} />
                  </motion.div>
                </div>
              ) : (
                <CollapsedBlockLabel index={index} label={label} />
              )}
            </motion.div>
          );
        })}
      </div>
    </FourierMotion>
  );
}

export const ColorDropIntroNext = defineReact({
  name: "ColorDropIntroNext",
  schema: colorDropIntroNextSchema,
  component({ props }) {
    return <ColorDropIntroNextLayer props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 5 },
      player: { background: "#171a16", loop: true },
    };
  },
});

export default ColorDropIntroNext;
