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

export const expand2LRSchema = defineSchema({
  textColor: field.color({
    label: "文字颜色",
    description: "展开完成后的文字主色。",
    default: "#f8f7ff",
  }),
  accentColor: field.color({
    label: "流光颜色",
    description: "中心向两侧展开的细光线与柔光颜色。",
    default: "#b9a7ff",
  }),
  fontSize: field.number({
    label: "字号",
    description: "文字的像素字号。",
    min: 18,
    max: 240,
    default: 104,
  }),
  fontWeight: field.number({
    label: "字重",
    description: "文字字重，建议使用 100 的整数倍。",
    min: 100,
    max: 900,
    integer: true,
    default: 720,
  }),
  letterSpacing: field.number({
    label: "字间距",
    description: "展开完成后的字形间距，单位为像素。",
    min: -8,
    max: 40,
    default: 0,
  }),
  lineGap: field.number({
    label: "行间距",
    description: "多行文字的行间距，单位为 em。",
    min: 0,
    max: 1,
    default: 0.18,
  }),
  softness: field.number({
    label: "柔化",
    description: "字形从中心展开时的初始模糊半径。",
    min: 0,
    max: 40,
    default: 18,
  }),
  overshoot: field.number({
    label: "回弹",
    description: "字形越过最终位置后的轻微回弹强度。",
    min: 0,
    max: 1,
    default: 0.42,
  }),
});

export type Expand2LRProps = InferFields<typeof expand2LRSchema>;

const GLYPH_WIDTH_EM = 0.78;

export function expand2LRCharacterFrames(
  index: number,
  total: number,
  fontSize: number,
  letterSpacing: number,
  softness: number,
  overshoot: number,
): readonly FourierMotionTarget[] {
  const center = (Math.max(1, total) - 1) / 2;
  const distance = Math.abs(index - center);
  const maximumDistance = Math.max(center, 1);
  const distanceRatio = Math.min(1, distance / maximumDistance);
  const advance = fontSize * GLYPH_WIDTH_EM + letterSpacing;
  const initialX = (center - index) * advance;
  const outwardDirection = index < center ? -1 : index > center ? 1 : 0;
  const overshootX = outwardDirection * fontSize * 0.04 * overshoot;
  const holdOffset = 0.08 + distanceRatio * 0.06;
  const expandOffset = 0.46 + distanceRatio * 0.2;
  const overshootOffset = 0.59 + distanceRatio * 0.19;
  const settledOffset = 0.77 + distanceRatio * 0.15;
  const hidden: FourierMotionTarget = {
    opacity: 0,
    x: initialX,
    scaleX: 0.22,
    scaleY: 0.94,
    rotateY: outwardDirection * -14,
    filter: `blur(${softness}px)`,
  };

  return [
    { ...hidden, offset: 0 },
    { ...hidden, offset: holdOffset },
    {
      opacity: 1,
      x: initialX * 0.08,
      scaleX: 1.055,
      scaleY: 1,
      rotateY: 0,
      filter: `blur(${Math.min(1.5, softness * 0.08)}px)`,
      offset: expandOffset,
    },
    {
      opacity: 1,
      x: overshootX,
      scaleX: 0.992,
      scaleY: 1,
      rotateY: 0,
      filter: "blur(0px)",
      offset: overshootOffset,
    },
    {
      opacity: 1,
      x: 0,
      scaleX: 1,
      scaleY: 1,
      rotateY: 0,
      filter: "blur(0px)",
      offset: settledOffset,
    },
    {
      opacity: 1,
      x: 0,
      scaleX: 1,
      scaleY: 1,
      rotateY: 0,
      filter: "blur(0px)",
      offset: 1,
    },
  ];
}

function ExpansionBeams({ accentColor }: { accentColor: string }): ReactNode {
  const frames: readonly FourierMotionTarget[] = [
    { opacity: 0, scaleX: 0, offset: 0 },
    { opacity: 0.9, scaleX: 0.08, offset: 0.14 },
    { opacity: 0.72, scaleX: 1, offset: 0.7 },
    { opacity: 0, scaleX: 1, offset: 0.9 },
    { opacity: 0, scaleX: 1, offset: 1 },
  ];

  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        left: "3%",
        right: "3%",
        bottom: "-0.16em",
        height: 2,
        pointerEvents: "none",
      }}
    >
      <motion.span
        animate={frames}
        transition={{ ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: "absolute",
          top: 0,
          right: "50%",
          width: "50%",
          height: "100%",
          borderRadius: 999,
          background: `linear-gradient(90deg, transparent, ${accentColor})`,
          boxShadow: `0 0 14px ${accentColor}`,
          transformOrigin: "100% 50%",
        }}
      />
      <motion.span
        animate={frames}
        transition={{ ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          width: "50%",
          height: "100%",
          borderRadius: 999,
          background: `linear-gradient(90deg, ${accentColor}, transparent)`,
          boxShadow: `0 0 14px ${accentColor}`,
          transformOrigin: "0% 50%",
        }}
      />
    </span>
  );
}

function ExpandText({ text, props }: { text: string; props: Expand2LRProps }): ReactNode {
  const { width, height } = useFourierContext();
  const lines = text.split("\n").map((line) => Array.from(line));

  return (
    <FourierMotion>
      <div
        data-expand2lr-text={text}
        style={{
          width,
          height,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          color: props.textColor,
          background: "transparent",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: props.fontSize,
          fontWeight: props.fontWeight,
          lineHeight: 1,
          textAlign: "center",
          textRendering: "geometricPrecision",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: `${props.lineGap}em`,
            padding: "0.28em 0.34em 0.38em",
          }}
        >
          {lines.map((characters, lineIndex) => (
            <div
              key={`${lineIndex}:${characters.join("")}`}
              style={{
                position: "relative",
                display: "flex",
                justifyContent: "center",
                minHeight: "1em",
                whiteSpace: "pre",
              }}
            >
              {characters.map((character, index) => (
                <motion.span
                  key={`${index}:${character}`}
                  data-expand2lr-character={index}
                  animate={expand2LRCharacterFrames(
                    index,
                    characters.length,
                    props.fontSize,
                    props.letterSpacing,
                    props.softness,
                    props.overshoot,
                  )}
                  transition={{ ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    display: "inline-grid",
                    placeItems: "center",
                    flex: `0 0 ${GLYPH_WIDTH_EM}em`,
                    width: `${GLYPH_WIDTH_EM}em`,
                    marginInlineEnd: index === characters.length - 1 ? 0 : props.letterSpacing,
                    color: props.textColor,
                    textShadow: `0 0 ${Math.max(4, props.fontSize * 0.08)}px ${props.accentColor}`,
                    transformOrigin: "50% 55%",
                    willChange: "transform, opacity, filter",
                  }}
                >
                  {character === " " ? "\u00a0" : character}
                </motion.span>
              ))}
              {characters.length > 0 ? (
                <ExpansionBeams accentColor={props.accentColor} />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </FourierMotion>
  );
}

function ExpandSubject({ subject, props }: { subject: ReactNode; props: Expand2LRProps }): ReactNode {
  const { width, height } = useFourierContext();

  return (
    <FourierMotion>
      <div
        style={{
          position: "relative",
          width,
          height,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          background: "transparent",
        }}
      >
        <motion.div
          data-expand2lr-subject="true"
          animate={[
            { opacity: 0, scaleX: 0.08, scaleY: 0.96, filter: `blur(${props.softness}px)`, offset: 0 },
            { opacity: 0, scaleX: 0.08, scaleY: 0.96, filter: `blur(${props.softness}px)`, offset: 0.1 },
            { opacity: 1, scaleX: 1.035, scaleY: 1, filter: "blur(0px)", offset: 0.62 },
            { opacity: 1, scaleX: 0.995, scaleY: 1, filter: "blur(0px)", offset: 0.76 },
            { opacity: 1, scaleX: 1, scaleY: 1, filter: "blur(0px)", offset: 0.88 },
            { opacity: 1, scaleX: 1, scaleY: 1, filter: "blur(0px)", offset: 1 },
          ]}
          transition={{ ease: [0.16, 1, 0.3, 1] }}
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            transformOrigin: "50% 50%",
            willChange: "transform, opacity, filter",
          }}
        >
          {subject}
        </motion.div>
        <div style={{ position: "absolute", left: "11%", right: "11%", top: "50%" }}>
          <ExpansionBeams accentColor={props.accentColor} />
        </div>
      </div>
    </FourierMotion>
  );
}

export const Expand2LR = defineMotion({
  name: "Expand2LR",
  schema: expand2LRSchema,
  supportsTextMotion: true,
  component({ subject, props }) {
    return <ExpandSubject subject={subject} props={props} />;
  },
  textComponent({ text, props }) {
    return <ExpandText text={text} props={props} />;
  },
  preview() {
    return { representativeProgress: 0.62, priority: "primary" };
  },
  designPreview() {
    return {
      props: {},
      subject: "EXPAND",
      composition: { width: 960, height: 300, durationSeconds: 3 },
      player: {
        background: "radial-gradient(circle at 50% 28%, #242039 0%, #0d0b16 58%, #07060c 100%)",
        loop: true,
      },
    };
  },
});

export default Expand2LR;
