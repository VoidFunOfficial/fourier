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

export const bouncyTextMotionSchema = defineSchema({
  textColor: field.color({
    label: "文字颜色",
    description: "大部分字形使用的主颜色",
    default: "#fff7ed",
  }),
  accentColor: field.color({
    label: "跳色",
    description: "间隔字形使用的强调色",
    default: "#ffd166",
  }),
  fontSize: field.number({
    label: "字号",
    min: 24,
    max: 220,
    default: 112,
  }),
  fontWeight: field.number({
    label: "字重",
    min: 400,
    max: 900,
    default: 800,
  }),
  letterSpacing: field.number({
    label: "字间距",
    min: -6,
    max: 32,
    default: 4,
  }),
  bounceHeight: field.number({
    label: "弹跳高度",
    description: "字形从下方蹦出的距离（像素）",
    min: 24,
    max: 180,
    default: 96,
  }),
  stagger: field.number({
    label: "逐字间隔",
    description: "0 表示同时出现，1 表示最明显的逐字错峰",
    min: 0,
    max: 1,
    default: 0.78,
  }),
  wobble: field.number({
    label: "摇摆幅度",
    description: "每个字交替左右歪斜的角度",
    min: 0,
    max: 18,
    default: 8,
  }),
});

export type BouncyTextMotionProps = InferFields<typeof bouncyTextMotionSchema>;

export function bouncyCharacterFrames(
  index: number,
  total: number,
  bounceHeight: number,
  stagger: number,
  wobble: number,
): readonly FourierMotionTarget[] {
  const progress = total <= 1 ? 0 : index / (total - 1);
  const start = 0.04 + progress * 0.48 * stagger;
  const direction = index % 2 === 0 ? -1 : 1;
  const hidden: FourierMotionTarget = {
    opacity: 0,
    y: bounceHeight,
    rotate: direction * wobble,
    scaleX: 0.76,
    scaleY: 1.22,
  };

  return [
    { ...hidden, offset: 0 },
    { ...hidden, offset: start, easing: "cubic-bezier(.2,.8,.2,1)" },
    {
      opacity: 1,
      y: -bounceHeight * 0.2,
      rotate: -direction * wobble * 0.28,
      scaleX: 0.9,
      scaleY: 1.1,
      offset: start + 0.11,
      easing: "cubic-bezier(.24,.74,.3,1)",
    },
    {
      opacity: 1,
      y: 4,
      rotate: direction * wobble * 0.12,
      scaleX: 1.13,
      scaleY: 0.86,
      offset: start + 0.18,
      easing: "cubic-bezier(.2,.8,.2,1)",
    },
    {
      opacity: 1,
      y: -bounceHeight * 0.07,
      rotate: -direction * wobble * 0.08,
      scaleX: 0.97,
      scaleY: 1.04,
      offset: start + 0.24,
      easing: "cubic-bezier(.2,.8,.2,1)",
    },
    {
      opacity: 1,
      y: 0,
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
      offset: start + 0.31,
      easing: "cubic-bezier(.16,1,.3,1)",
    },
    { opacity: 1, y: 0, rotate: 0, scaleX: 1, scaleY: 1, offset: 1 },
  ];
}

function BouncyText({
  text,
  props,
}: {
  text: string;
  props: BouncyTextMotionProps;
}): ReactNode {
  const { width, height } = useFourierContext();
  const characters = Array.from(text);

  return (
    <FourierMotion>
      <div
        aria-label={text}
        style={{
          width,
          height,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          background: "transparent",
          fontFamily: "ui-rounded, 'Arial Rounded MT Bold', ui-sans-serif, system-ui, sans-serif",
          fontSize: props.fontSize,
          fontWeight: props.fontWeight,
          letterSpacing: props.letterSpacing,
          lineHeight: 1.12,
          textAlign: "center",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            maxWidth: "92%",
            padding: "0.3em 0.28em",
            whiteSpace: "pre-wrap",
          }}
        >
          {characters.map((character, index) => {
            if (character === "\n") return <br key={`line:${index}`} />;
            const isSpace = character === " " || character === "\t";
            return (
              <span
                key={`${index}:${character}`}
                style={{
                  position: "relative",
                  display: "inline-block",
                  minWidth: isSpace ? "0.34em" : undefined,
                }}
              >
                <motion.span
                  animate={bouncyCharacterFrames(
                    index,
                    characters.length,
                    props.bounceHeight,
                    props.stagger,
                    props.wobble,
                  )}
                  transition={{ fill: "both" }}
                  style={{
                    position: "relative",
                    zIndex: 1,
                    display: "inline-block",
                    color: index % 3 === 1 ? props.accentColor : props.textColor,
                    textShadow: "0 0.08em 0 rgba(94,53,89,.28), 0 0.18em 0.28em rgba(14,8,28,.28)",
                    transformOrigin: "50% 88%",
                  }}
                >
                  {isSpace ? "\u00a0" : character}
                </motion.span>
              </span>
            );
          })}
        </span>
      </div>
    </FourierMotion>
  );
}

function BouncySubject({
  subject,
  props,
}: {
  subject: ReactNode;
  props: BouncyTextMotionProps;
}): ReactNode {
  const { width, height } = useFourierContext();
  return (
    <FourierMotion>
      <div style={{ width, height, overflow: "hidden", background: "transparent" }}>
        <motion.div
          animate={bouncyCharacterFrames(0, 1, props.bounceHeight, 0, props.wobble)}
          transition={{ fill: "both" }}
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            transformOrigin: "50% 88%",
          }}
        >
          {subject}
        </motion.div>
      </div>
    </FourierMotion>
  );
}

export const BouncyTextMotion = defineMotion({
  name: "BouncyTextMotion",
  schema: bouncyTextMotionSchema,
  supportsTextMotion: true,
  component({ subject, props }) {
    return <BouncySubject subject={subject} props={props} />;
  },
  textComponent({ text, props }) {
    return <BouncyText text={text} props={props} />;
  },
  preview() {
    return { representativeProgress: 0.58, priority: "primary" };
  },
  designPreview() {
    return {
      props: {},
      subject: "蹦蹦跳跳！",
      composition: { width: 960, height: 320, durationSeconds: 3 },
      player: {
        background: "radial-gradient(circle at 50% 18%, #6f5aa8 0%, #3b315d 58%, #211a38 100%)",
        loop: true,
      },
    };
  },
});

export default BouncyTextMotion;
