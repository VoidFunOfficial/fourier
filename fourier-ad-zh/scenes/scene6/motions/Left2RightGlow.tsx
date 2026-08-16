import {
  defineMotion,
  defineSchema,
  field,
  useLayoutEffect,
  useRef,
  useFourierContext,
  useFourierLifecycle,
  useFourierTimeline,
  type CSSProperties,
  type InferFields,
  type ReactNode,
  type RefObject,
} from "@fourier-video/sdk/motion";

export const textGlowMotionSchema = defineSchema({
  baseColor: field.color({ label: "Base text color", default: "#94a3b8" }),
  accentColor: field.color({ label: "Light-band color", default: "#38bdf8" }),
  glowColor: field.color({ label: "Highlight color", default: "#ffffff" }),
  fontSize: field.number({ label: "Font size", min: 16, max: 240, default: 96 }),
  letterSpacing: field.number({ label: "Letter spacing", min: -4, max: 32, default: 6 }),
  glowRadius: field.number({ label: "Glow radius", min: 0, max: 60, default: 24 }),
});

export type TextGlowMotionProps = InferFields<typeof textGlowMotionSchema>;

function useLeftToRightGlow(
  target: RefObject<HTMLElement | null>,
  variant: "text" | "subject",
): void {
  const timeline = useFourierTimeline();
  useFourierLifecycle({ fourierStart() {}, fourierEnd() {} });

  useLayoutEffect(() => {
    if (target.current === null) throw new Error("TextGlowMotion target is missing");
    if (variant === "text") {
      timeline.animate(target.current, [
        { backgroundPosition: "-75% 0", opacity: 0.45 },
        { backgroundPosition: "50% 0", opacity: 1, offset: 0.5 },
        { backgroundPosition: "175% 0", opacity: 0.45 },
      ], { fill: "both", easing: "ease-in-out" });
      return;
    }
    timeline.animate(target.current, [
      { transform: "translateX(-260%)", opacity: 0 },
      { opacity: 1, offset: 0.18 },
      { opacity: 1, offset: 0.82 },
      { transform: "translateX(360%)", opacity: 0 },
    ], { fill: "both", easing: "ease-in-out" });
  }, [target, timeline, variant]);
}

function GlowText({ text, props }: { text: string; props: TextGlowMotionProps }): ReactNode {
  const context = useFourierContext();
  const glow = useRef<HTMLSpanElement>(null);
  useLeftToRightGlow(glow, "text");

  const textStyle: CSSProperties = {
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSize: props.fontSize,
    fontWeight: 800,
    letterSpacing: props.letterSpacing,
    lineHeight: 1.1,
    whiteSpace: "pre-wrap",
    textAlign: "center",
  };

  return (
    <div
      data-text-glow-motion={text}
      style={{
        width: context.width,
        height: context.height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background: "transparent",
      }}
    >
      <span style={{ position: "relative", display: "inline-block", ...textStyle }}>
        <span style={{ color: props.baseColor }}>{text}</span>
        <span
          ref={glow}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            color: "transparent",
            backgroundImage: `linear-gradient(90deg, transparent 0%, ${props.accentColor} 28%, ${props.glowColor} 50%, ${props.accentColor} 72%, transparent 100%)`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "-75% 0",
            backgroundSize: "42% 100%",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            filter: `drop-shadow(0 0 ${props.glowRadius}px ${props.accentColor})`,
            ...textStyle,
          }}
        >
          {text}
        </span>
      </span>
    </div>
  );
}

function GlowSubject({ subject, props }: { subject: ReactNode; props: TextGlowMotionProps }): ReactNode {
  const context = useFourierContext();
  const glow = useRef<HTMLDivElement>(null);
  useLeftToRightGlow(glow, "subject");

  return (
    <div style={{
      position: "relative",
      width: context.width,
      height: context.height,
      overflow: "hidden",
      background: "transparent",
    }}>
      <div style={{ position: "absolute", inset: 0, display: "flex" }}>{subject}</div>
      <div
        ref={glow}
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: "38%",
          background: `linear-gradient(90deg, transparent, ${props.accentColor}, ${props.glowColor}, transparent)`,
          filter: `blur(${Math.max(1, props.glowRadius / 3)}px)`,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export const TextGlowMotion = defineMotion({
  name: "LeftToRightTextGlow",
  schema: textGlowMotionSchema,
  supportsTextMotion: true,
  component({ subject, props }) {
    return <GlowSubject subject={subject} props={props} />;
  },
  textComponent({ text, props }) {
    return <GlowText text={text} props={props} />;
  },
  preview() {
    return { representativeProgress: 0.5, priority: "primary" };
  },
  designPreview() {
    return {
      props: {},
      subject: "FOURIER 之光",
      composition: { width: 960, height: 240, durationSeconds: 3 },
      player: { loop: true },
    };
  },
});

export default TextGlowMotion;
