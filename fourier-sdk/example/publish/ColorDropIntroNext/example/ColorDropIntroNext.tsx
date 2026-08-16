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
  type ReactNode,
} from "@fourier-video/sdk";
import {
  MAX_COLOR_DROP_BLOCKS,
  colorDropBlockFrames,
  colorDropContents,
  colorDropIntroSchema,
} from "./ColorDropIntro.tsx";

export const colorDropIntroNextSchema = defineSchema({
  ...colorDropIntroSchema,
  selectedBlock: field.number({
    label: "展开色块",
    description: "从 1 开始；超出当前色块数量时自动选择最后一块。",
    min: 1,
    max: MAX_COLOR_DROP_BLOCKS,
    integer: true,
    default: 3,
  }),
  settlePause: field.number({
    label: "落稳停顿（秒）",
    description: "最后一个色块急刹完成后，到展开碰撞开始前的停顿。",
    min: 0,
    max: 1.2,
    default: 0.28,
  }),
  expandDuration: field.number({
    label: "展开时长（秒）",
    min: 0.45,
    max: 2.2,
    default: 0.9,
  }),
  collisionStrength: field.number({
    label: "碰撞强度",
    description: "控制被撞色块的挤压、过冲和展开色块的蓄力幅度。",
    min: 0,
    max: 1,
    default: 0.86,
  }),
  collisionWave: field.number({
    label: "碰撞传递（秒）",
    description: "离展开色块越远，收到碰撞的时间越晚。",
    min: 0,
    max: 0.18,
    default: 0.055,
  }),
});

export type ColorDropIntroNextProps = InferFields<typeof colorDropIntroNextSchema>;

export interface ColorDropNextTimelineOptions {
  readonly index: number;
  readonly count: number;
  readonly selectedIndex: number;
  readonly width: number;
  readonly gap: number;
  readonly dropDuration: number;
  readonly staggerDelay: number;
  readonly settlePause: number;
  readonly expandDuration: number;
  readonly collisionStrength: number;
  readonly collisionWave: number;
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
  index: number,
  dropDuration: number,
  staggerDelay: number,
  brakeIntensity: number,
  timelineDuration: number,
): FourierMotionTarget[] {
  const localFrames = colorDropBlockFrames(brakeIntensity);
  const first = localFrames[0]!;
  const delay = index * staggerDelay;
  const frames: FourierMotionTarget[] = [
    { ...withoutOffset(first), offset: 0 },
  ];

  localFrames.forEach((frame, frameIndex) => {
    const localOffset = frame.offset ?? 0;
    const offset = at(delay + localOffset * dropDuration, timelineDuration);
    if (frameIndex === 0 && offset === 0) return;
    frames.push({ ...withoutOffset(frame), offset });
  });
  return frames;
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
  const firstImpactWidth = blockWidth + (canvasWidth - blockWidth) * (0.19 + force * 0.05);
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
  direction: -1 | 1,
  distance: number,
  initialLeft: number,
  blockWidth: number,
  canvasWidth: number,
  collisionStrength: number,
): FourierMotionTarget[] {
  const force = clamp(collisionStrength, 0, 1);
  const finalX = direction < 0
    ? -(initialLeft + blockWidth + Math.max(2, canvasWidth * 0.012))
    : canvasWidth - initialLeft + Math.max(2, canvasWidth * 0.012);
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
    frame(0.12, direction * blockWidth * 0.045 * force, bulge, {
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

/**
 * One absolute, seekable choreography for both phases: staggered drop first,
 * then a selected panel expands while a collision wave pushes its neighbours out.
 */
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
  const staggerDelay = Math.max(0, options.staggerDelay);
  const settlePause = Math.max(0, options.settlePause);
  const expandDuration = Math.max(0.001, options.expandDuration);
  const collisionWave = Math.max(0, options.collisionWave);
  const distance = Math.abs(index - selectedIndex);
  const maximumDistance = Math.max(selectedIndex, count - 1 - selectedIndex);
  const finalDropSeconds = dropDuration + (count - 1) * staggerDelay;
  const expansionStartSeconds = finalDropSeconds + settlePause;
  const waveDelay = distance === 0 ? 0 : Math.max(0, distance - 1) * collisionWave;
  const durationSeconds = expansionStartSeconds
    + expandDuration
    + Math.max(0, maximumDistance - 1) * collisionWave;
  const panelExpansionStart = expansionStartSeconds + waveDelay;
  const frames = remappedDropFrames(
    index,
    dropDuration,
    staggerDelay,
    options.collisionStrength,
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
  const expansionFrames = selected
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
        index < selectedIndex ? -1 : 1,
        distance,
        initialLeft,
        blockWidth,
        options.width,
        options.collisionStrength,
      );
  frames.push(...expansionFrames);

  const last = frames.at(-1)!;
  if ((last.offset ?? 1) < 1) {
    frames.push({ ...last, offset: 1 });
  }

  return {
    durationSeconds,
    expansionStartSeconds,
    blockWidth,
    initialLeft,
    selected,
    frames,
  };
}

function colors(props: ColorDropIntroNextProps): readonly string[] {
  return [
    props.color1,
    props.color2,
    props.color3,
    props.color4,
    props.color5,
    props.color6,
    props.color7,
    props.color8,
  ];
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

function ColorDropIntroNextLayer({ props }: { props: ColorDropIntroNextProps }) {
  const { width, height } = useFourierContext();
  const count = clamp(Math.floor(props.count), 1, MAX_COLOR_DROP_BLOCKS);
  const selectedIndex = clamp(Math.floor(props.selectedBlock) - 1, 0, count - 1);
  const palette = colors(props);
  const contents = colorDropContents(props.contents, count);

  return (
    <FourierMotion>
      <div
        role="group"
        aria-label="Color drop intro with expanding panel"
        style={{
          position: "relative",
          width,
          height,
          overflow: "hidden",
          background: props.background,
          isolation: "isolate",
        }}
      >
        {contents.map((content, index) => {
          const timeline = colorDropNextTimeline({
            index,
            count,
            selectedIndex,
            width,
            gap: props.gap,
            dropDuration: props.dropDuration,
            staggerDelay: props.staggerDelay,
            settlePause: props.settlePause,
            expandDuration: props.expandDuration,
            collisionStrength: props.collisionStrength,
            collisionWave: props.collisionWave,
          });
          const color = palette[index]!;
          const direction = index < selectedIndex ? "100% 50%" : "0% 50%";
          return (
            <motion.div
              key={index}
              data-color-drop-next-block={index + 1}
              data-selected={timeline.selected ? "true" : "false"}
              aria-label={`Color block ${index + 1}${timeline.selected ? ", selected" : ""}`}
              animate={timeline.frames}
              transition={{ duration: timeline.durationSeconds, ease: "linear", fill: "both" }}
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
                padding: props.padding,
                color: foreground(color),
                background: color,
                borderLeft: index === 0 ? "none" : "1px solid rgba(17,19,24,0.13)",
                boxShadow: timeline.selected
                  ? "0 0 0 rgba(0,0,0,0)"
                  : "0 0 34px rgba(0,0,0,0.3)",
                fontFamily: "Inter, Arial, sans-serif",
                transformOrigin: timeline.selected ? "50% 50%" : direction,
                zIndex: timeline.selected ? 1 : 3 + Math.abs(index - selectedIndex),
                willChange: "transform, left, width",
              }}
            >
              <div
                data-color-drop-next-content={index + 1}
                style={{
                  position: "relative",
                  width: "100%",
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {content}
              </div>
            </motion.div>
          );
        })}
      </div>
    </FourierMotion>
  );
}

function NextPreviewCopy({
  number,
  word,
  detail,
}: {
  number: string;
  word: string;
  detail: string;
}): ReactNode {
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          marginBottom: 14,
          fontSize: 11,
          fontWeight: 780,
          letterSpacing: 2.4,
          opacity: 0.64,
        }}
      >
        {number} / SELECT
      </div>
      <div
        style={{
          fontSize: "clamp(38px, 6.8vw, 76px)",
          fontWeight: 880,
          lineHeight: 0.87,
          letterSpacing: -3.4,
          textTransform: "uppercase",
          overflowWrap: "anywhere",
        }}
      >
        {word}
      </div>
      <div
        style={{
          width: 29,
          height: 3,
          marginTop: 20,
          marginBottom: 12,
          background: "currentColor",
          opacity: 0.82,
        }}
      />
      <div
        style={{
          maxWidth: 170,
          fontSize: 10,
          fontWeight: 650,
          lineHeight: 1.4,
          letterSpacing: 0.75,
          textTransform: "uppercase",
          opacity: 0.64,
        }}
      >
        {detail}
      </div>
    </div>
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
      props: {
        selectedBlock: 3,
        contents: [
          NextPreviewCopy({ number: "01", word: "CHOOSE", detail: "Every panel lands first" }),
          NextPreviewCopy({ number: "02", word: "YOUR", detail: "Then the collision starts" }),
          NextPreviewCopy({ number: "03", word: "IMPACT", detail: "Selected panel takes the frame" }),
          NextPreviewCopy({ number: "04", word: "PUSH", detail: "Neighbours compress and move" }),
          NextPreviewCopy({ number: "05", word: "WIDE", detail: "Finish in full screen" }),
        ],
      },
      composition: { width: 960, height: 540, durationSeconds: 4 },
      player: { background: "#101114", loop: true },
    };
  },
});

export default ColorDropIntroNext;
