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

export const staggerTextSchema = defineSchema({
  textColor: field.color({ label: "文字颜色", default: "#f8fafc" }),
  accentColor: field.color({ label: "高光颜色", default: "#a7f3d0" }),
  fontSize: field.number({ label: "字号", min: 18, max: 220, default: 92 }),
  letterSpacing: field.number({ label: "字间距", min: -6, max: 30, default: 2 }),
  stagger: field.number({ label: "错落强度", min: 0, max: 1, default: 0.72 }),
});

export type StaggerTextProps = InferFields<typeof staggerTextSchema>;

function characterFrames(
  index: number,
  total: number,
  stagger: number,
): readonly FourierMotionTarget[] {
  const start = total <= 1 ? 0 : index / (total - 1) * 0.32 * stagger;
  const reveal = Math.min(0.68, start + 0.2);
  const hidden: FourierMotionTarget = {
    opacity: 0,
    y: 46,
    rotate: index % 2 === 0 ? -5 : 5,
    scale: 0.9,
    filter: "blur(14px)",
  };
  return [
    { ...hidden, offset: 0 },
    ...(start > 0 ? [{ ...hidden, offset: start }] : []),
    { opacity: 1, y: -3, rotate: 0, scale: 1.015, filter: "blur(0px)", offset: reveal },
    { opacity: 1, y: 0, rotate: 0, scale: 1, filter: "blur(0px)", offset: Math.min(0.82, reveal + 0.11) },
    { opacity: 1, y: 0, rotate: 0, scale: 1, filter: "blur(0px)", offset: 1 },
  ];
}

function TextLayer({ text, props }: { text: string; props: StaggerTextProps }): ReactNode {
  const { width, height } = useFourierContext();
  const characters = Array.from(text);
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
          color: props.textColor,
          background: "transparent",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: props.fontSize,
          fontWeight: 720,
          letterSpacing: props.letterSpacing,
          lineHeight: 1.04,
          textAlign: "center",
          textShadow: "0 14px 36px rgba(0,0,0,.32)",
        }}
      >
        <div style={{ position: "relative", padding: "0.18em 0.28em", whiteSpace: "pre-wrap" }}>
          {characters.map((character, index) => (
            <motion.span
              key={`${index}:${character}`}
              animate={characterFrames(index, characters.length, props.stagger)}
              transition={{ ease: [0.16, 1, 0.3, 1] }}
              style={{
                display: "inline-block",
                minWidth: character === " " ? "0.3em" : undefined,
                color: index === characters.length - 1 ? props.accentColor : props.textColor,
                transformOrigin: "50% 80%",
              }}
            >
              {character === " " ? "\u00a0" : character}
            </motion.span>
          ))}
          <motion.span
            aria-hidden="true"
            animate={[
              { opacity: 0, scaleX: 0, offset: 0 },
              { opacity: 0, scaleX: 0, offset: 0.5 },
              { opacity: 1, scaleX: 1, offset: 0.68 },
              { opacity: 0.45, scaleX: 1, offset: 1 },
            ]}
            transition={{ ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute",
              left: "8%",
              right: "8%",
              bottom: 0,
              height: 3,
              borderRadius: 999,
              background: `linear-gradient(90deg, transparent, ${props.accentColor}, transparent)`,
              transformOrigin: "50% 50%",
            }}
          />
        </div>
      </div>
    </FourierMotion>
  );
}

function SubjectLayer({ children }: { children: ReactNode }): ReactNode {
  const { width, height } = useFourierContext();
  return (
    <FourierMotion>
      <div style={{ width, height, overflow: "hidden" }}>
        <motion.div
          animate={[
            { opacity: 0, y: 42, scale: 0.96, filter: "blur(14px)", offset: 0 },
            { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", offset: 0.42 },
            { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", offset: 1 },
          ]}
          transition={{ ease: [0.16, 1, 0.3, 1] }}
          style={{ width: "100%", height: "100%", display: "flex" }}
        >
          {children}
        </motion.div>
      </div>
    </FourierMotion>
  );
}

export const StaggerTextMotion = defineMotion({
  name: "StaggerTextMotion",
  schema: staggerTextSchema,
  supportsTextMotion: true,
  component({ subject }) {
    return <SubjectLayer>{subject}</SubjectLayer>;
  },
  textComponent({ text, props }) {
    return <TextLayer text={text} props={props} />;
  },
  preview() {
    return { representativeProgress: 0.52, priority: "primary" };
  },
  designPreview() {
    return {
      props: {},
      subject: "Move beautifully.",
      composition: { width: 960, height: 280, durationSeconds: 3 },
      player: {
        background: "radial-gradient(circle at 50% 12%, #223247 0%, #0a0f18 58%, #05070c 100%)",
        loop: true,
      },
    };
  },
});

export default StaggerTextMotion;
