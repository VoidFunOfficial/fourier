import {
  Children,
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

export const MAX_COLOR_DROP_BLOCKS = 8;

export const colorDropIntroSchema = defineSchema({
  count: field.number({
    label: "色块数量",
    description: "横向等分画布；颜色和内容按顺序取前 N 项。",
    min: 1,
    max: MAX_COLOR_DROP_BLOCKS,
    integer: true,
    default: 5,
  }),
  color1: field.color({ label: "色块 1", default: "#f1eee7" }),
  color2: field.color({ label: "色块 2", default: "#d8ff3e" }),
  color3: field.color({ label: "色块 3", default: "#ff5c35" }),
  color4: field.color({ label: "色块 4", default: "#ff4f91" }),
  color5: field.color({ label: "色块 5", default: "#4169ff" }),
  color6: field.color({ label: "色块 6", default: "#8d5cff" }),
  color7: field.color({ label: "色块 7", default: "#29d6c7" }),
  color8: field.color({ label: "色块 8", default: "#ffc247" }),
  contents: field.node({
    label: "色块内容",
    description: "传入 ReactNode 数组；每一项进入对应色块的内容容器，可放文字、图片或组合节点。",
  }),
  background: field.color({ label: "底色", default: "#101114" }),
  gap: field.number({
    label: "色块间距",
    min: 0,
    max: 32,
    integer: true,
    default: 0,
  }),
  padding: field.number({
    label: "内容内边距",
    min: 12,
    max: 96,
    integer: true,
    default: 30,
  }),
  contentAlign: field.enum(["top", "center", "bottom"] as const, {
    label: "内容位置",
    default: "bottom",
  }),
  staggerDelay: field.number({
    label: "色块延迟（秒）",
    description: "相邻色块开始下落的时间差。",
    min: 0,
    max: 0.5,
    default: 0.13,
  }),
  dropDuration: field.number({
    label: "单块下落时长（秒）",
    min: 0.45,
    max: 2.4,
    default: 1.05,
  }),
  brakeIntensity: field.number({
    label: "急刹强度",
    description: "控制落地瞬间的纵向挤压与回弹。",
    min: 0,
    max: 1,
    default: 0.82,
  }),
});

export type ColorDropIntroProps = InferFields<typeof colorDropIntroSchema>;

const DEFAULT_FONT = "Inter, Arial, sans-serif";

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
    { y: "-112%", scaleY: 1, offset: 0 },
    {
      y: "-112%",
      scaleY: 1,
      offset: 0.055,
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

export function colorDropBlockDelay(index: number, staggerDelay: number): number {
  return Math.max(0, Math.floor(index)) * Math.max(0, staggerDelay);
}

export function colorDropContents(
  contents: ReactNode,
  count: number,
): readonly ReactNode[] {
  const slots = Children.toArray(contents);
  const safeCount = clamp(Math.floor(count), 1, MAX_COLOR_DROP_BLOCKS);
  return Array.from({ length: safeCount }, (_, index) => slots[index] ?? null);
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

function ColorDropIntroLayer({ props }: { props: ColorDropIntroProps }) {
  const { width, height } = useFourierContext();
  const blockCount = clamp(Math.floor(props.count), 1, MAX_COLOR_DROP_BLOCKS);
  const colors = palette(props);
  const contents = colorDropContents(props.contents, blockCount);

  return (
    <FourierMotion>
      <div
        role="group"
        aria-label="Color drop intro"
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
        {contents.map((content, index) => {
          const color = colors[index]!;
          return (
            <motion.div
              key={index}
              data-color-drop-block={index + 1}
              aria-label={`Color block ${index + 1}`}
              animate={colorDropBlockFrames(props.brakeIntensity)}
              transition={{
                duration: props.dropDuration,
                delay: colorDropBlockDelay(index, props.staggerDelay),
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
                borderLeft: index === 0 ? "none" : "1px solid rgba(17,19,24,0.13)",
                boxShadow: "0 22px 44px rgba(0,0,0,0.24)",
                fontFamily: DEFAULT_FONT,
                transformOrigin: "50% 100%",
                willChange: "transform",
              }}
            >
              <div
                data-color-drop-content={index + 1}
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

function PreviewCopy({
  number,
  word,
  detail,
}: {
  number: string;
  word: string;
  detail: string;
}) {
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          marginBottom: 14,
          fontSize: 11,
          fontWeight: 750,
          letterSpacing: 2.8,
          opacity: 0.68,
        }}
      >
        {number} / FIVE
      </div>
      <div
        style={{
          fontSize: 43,
          fontWeight: 850,
          lineHeight: 0.88,
          letterSpacing: -2.8,
          textTransform: "uppercase",
          overflowWrap: "anywhere",
        }}
      >
        {word}
      </div>
      <div
        style={{
          width: 26,
          height: 3,
          marginTop: 21,
          marginBottom: 13,
          background: "currentColor",
          opacity: 0.84,
        }}
      />
      <div
        style={{
          maxWidth: 110,
          fontSize: 10,
          fontWeight: 650,
          lineHeight: 1.35,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          opacity: 0.66,
        }}
      >
        {detail}
      </div>
    </div>
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
      props: {
        contents: [
          PreviewCopy({ number: "01", word: "DROP", detail: "Gravity starts the story" }),
          PreviewCopy({ number: "02", word: "COLOR", detail: "Build a louder palette" }),
          PreviewCopy({ number: "03", word: "INTO", detail: "One beat at a time" }),
          PreviewCopy({ number: "04", word: "THE", detail: "Brake right on impact" }),
          PreviewCopy({ number: "05", word: "FRAME", detail: "Fourier React intro" }),
        ],
      },
      composition: { width: 960, height: 540, durationSeconds: 3 },
      player: { background: "#101114", loop: true },
    };
  },
});

export default ColorDropIntro;
