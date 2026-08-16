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

export const lightEffectCardSchema = defineSchema({
  text: field.string({
    label: "卡片文字",
    description: "显示在卡片中央的文字。",
    minLength: 1,
    maxLength: 120,
    default: "Designer",
  }),
  glowColor: field.color({
    label: "光效颜色",
    description: "控制卡片四周柔和光晕的颜色。",
    default: "#4f9cff",
  }),
  fillColor: field.color({
    label: "填充颜色",
    description: "卡片主体的填充颜色。",
    default: "#3f7ed4",
  }),
});

export type LightEffectCardProps = InferFields<typeof lightEffectCardSchema>;

/** A restrained, seamless light pulse matching the soft halo in the reference. */
export function lightEffectCardGlowFrames(): readonly FourierMotionTarget[] {
  return [
    { opacity: 0.38, scale: 0.985, offset: 0 },
    { opacity: 0.7, scale: 1.018, offset: 0.5 },
    { opacity: 0.38, scale: 0.985, offset: 1 },
  ];
}

/** A broad, low-opacity surface reflection that disappears at both loop edges. */
export function lightEffectCardSweepFrames(
  travelDistance: number,
): readonly FourierMotionTarget[] {
  const distance = Math.max(1, travelDistance);
  return [
    { x: 0, opacity: 0, offset: 0 },
    { x: distance * 0.08, opacity: 0, offset: 0.18 },
    { x: distance * 0.28, opacity: 0.11, offset: 0.34 },
    { x: distance * 0.72, opacity: 0.08, offset: 0.7 },
    { x: distance, opacity: 0, offset: 0.86 },
    { x: distance, opacity: 0, offset: 1 },
  ];
}

function LightEffectCardLayer({ props }: { props: LightEffectCardProps }) {
  const { width, height } = useFourierContext();
  const glyphCount = Math.max(1, Array.from(props.text).length);
  const fontSize = Math.max(
    16,
    Math.min(72, height * 0.17, (width - 48) / (glyphCount * 0.66 + 0.9)),
  );
  const horizontalPadding = Math.max(12, fontSize * 0.4);
  const verticalPadding = Math.max(9, fontSize * 0.22);
  const estimatedCardWidth = Math.min(
    width - 24,
    fontSize * glyphCount * 0.61 + horizontalPadding * 2,
  );
  const estimatedCardHeight = fontSize + verticalPadding * 2;
  const visualScale = Math.max(0.35, Math.min(1, estimatedCardHeight / 104));
  const borderRadius = Math.max(12, estimatedCardHeight * 0.27);

  return (
    <FourierMotion>
      <div
        aria-label={props.text}
        data-light-effect-card=""
        style={{
          position: "relative",
          width,
          height,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          background: "transparent",
          isolation: "isolate",
        }}
      >
        <div
          style={{
            position: "relative",
            display: "inline-flex",
            maxWidth: Math.max(1, width - 24),
          }}
        >
          <motion.div
            aria-hidden="true"
            data-light-effect-card-glow=""
            animate={lightEffectCardGlowFrames()}
            transition={{ ease: "ease-in-out", fill: "both" }}
            style={{
              position: "absolute",
              inset: -Math.max(8, 14 * visualScale),
              borderRadius: borderRadius + Math.max(8, 14 * visualScale),
              background: props.glowColor,
              filter: `blur(${Math.max(16, 30 * visualScale)}px)`,
              mixBlendMode: "screen",
              transformOrigin: "50% 50%",
              willChange: "transform, opacity",
            }}
          />

          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: -Math.max(3, 5 * visualScale),
              borderRadius: borderRadius + Math.max(3, 5 * visualScale),
              background: props.glowColor,
              opacity: 0.84,
              filter: `blur(${Math.max(6, 10 * visualScale)}px)`,
              mixBlendMode: "screen",
            }}
          />

          <div
            data-light-effect-card-surface=""
            style={{
              position: "relative",
              zIndex: 1,
              display: "inline-flex",
              maxWidth: "100%",
              overflow: "hidden",
              padding: `${verticalPadding}px ${horizontalPadding}px`,
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius,
              boxSizing: "border-box",
              background: props.fillColor,
              boxShadow:
                "0 10px 28px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 0 rgba(0,0,0,0.08)",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.025) 46%, rgba(0,0,0,0.045) 100%)",
                pointerEvents: "none",
              }}
            />

            <motion.div
              aria-hidden="true"
              animate={lightEffectCardSweepFrames(estimatedCardWidth * 1.55)}
              transition={{ ease: "ease-in-out", fill: "both" }}
              style={{
                position: "absolute",
                top: "-40%",
                bottom: "-40%",
                left: "-48%",
                width: "34%",
                rotate: "10deg",
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.72), transparent)",
                filter: `blur(${Math.max(8, 15 * visualScale)}px)`,
                pointerEvents: "none",
                willChange: "transform, opacity",
              }}
            />

            <div
              style={{
                position: "relative",
                zIndex: 1,
                color: "#efefeb",
                fontFamily: "ui-sans-serif, system-ui, sans-serif",
                fontSize,
                fontWeight: 760,
                lineHeight: 1,
                letterSpacing: "-0.045em",
                textAlign: "center",
                whiteSpace: "nowrap",
                textShadow: "0 1px 2px rgba(0,0,0,0.16)",
              }}
            >
              {props.text}
            </div>
          </div>
        </div>
      </div>
    </FourierMotion>
  );
}

export const LightEffectCard = defineReact({
  name: "LightEffectCard",
  schema: lightEffectCardSchema,
  component({ props }) {
    return <LightEffectCardLayer props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 960, height: 540, durationSeconds: 4 },
      player: { background: "#131a22", loop: true },
    };
  },
});

export default LightEffectCard;
