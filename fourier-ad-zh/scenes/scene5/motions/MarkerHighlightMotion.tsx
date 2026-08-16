import {
  FourierMotion,
  defineMotion,
  defineSchema,
  field,
  motion,
  useFourierContext,
  type CSSProperties,
  type InferFields,
  type ReactNode,
} from "@fourier-video/sdk/motion";

export const markerHighlightSchema = defineSchema({
  color: field.color({ label: "Marker color", default: "#ffd84d" }),
  thickness: field.number({ label: "Stroke thickness", min: 4, max: 80, default: 18 }),
  position: field.number({ label: "Vertical position", min: 0, max: 100, default: 50 }),
  inset: field.number({ label: "Horizontal inset", min: 0, max: 30, default: 7 }),
  angle: field.number({ label: "Stroke angle", min: -12, max: 12, default: -1.5 }),
  opacity: field.number({ label: "Color density", min: 0.1, max: 1, default: 0.64 }),
  roughness: field.number({ label: "Texture strength", min: 0, max: 1, default: 0.72 }),
  blendMode: field.enum(["multiply", "normal", "screen"] as const, {
    label: "Blend mode",
    default: "multiply",
  }),
  showNib: field.boolean({ label: "Show moving nib", default: true }),
});

export type MarkerHighlightProps = InferFields<typeof markerHighlightSchema>;

const brushEdge = "polygon(0 19%, 1.2% 11%, 4.8% 15%, 9% 8%, 15% 13%, 22% 5%, 29% 10%, 37% 7%, 45% 12%, 53% 5%, 61% 10%, 69% 6%, 77% 13%, 84% 8%, 91% 12%, 97.5% 7%, 100% 18%, 99.4% 79%, 96% 86%, 90% 82%, 84% 91%, 76% 84%, 68% 92%, 60% 86%, 51% 94%, 43% 87%, 35% 92%, 27% 85%, 19% 93%, 11% 86%, 5% 91%, 1% 84%)";

function MarkerStroke({ props }: { props: MarkerHighlightProps }): ReactNode {
  const textureOpacity = 0.08 + props.roughness * 0.24;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: `${props.inset}%`,
        right: `${props.inset}%`,
        top: `${props.position}%`,
        height: `${props.thickness}%`,
        opacity: props.opacity,
        mixBlendMode: props.blendMode,
        pointerEvents: "none",
        transform: `translateY(-50%) rotate(${props.angle}deg)`,
        transformOrigin: "50% 50%",
        isolation: "isolate",
      }}
    >
      <motion.div
        data-marker-highlight-stroke=""
        animate={[
          { clipPath: "inset(-24% 100% -24% 0)", offset: 0 },
          { clipPath: "inset(-24% 100% -24% 0)", offset: 0.06 },
          { clipPath: "inset(-24% -2% -24% 0)", offset: 0.74 },
          { clipPath: "inset(-24% -2% -24% 0)", offset: 1 },
        ]}
        transition={{ ease: [0.4, 0, 0.2, 1], fill: "both" }}
        style={{ position: "absolute", inset: "-16px -12px", willChange: "clip-path" }}
      >
        <div
          style={{
            position: "absolute",
            inset: "16px 12px",
            backgroundColor: props.color,
            clipPath: brushEdge,
            filter: `blur(${0.15 + props.roughness * 0.45}px)`,
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            top: "24%",
            bottom: "22%",
            opacity: 0.34 + props.roughness * 0.28,
            background: `linear-gradient(180deg, transparent, ${props.color} 16%, ${props.color} 82%, transparent)`,
            filter: `blur(${1 + props.roughness * 1.8}px)`,
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: "16px 12px",
            opacity: textureOpacity,
            clipPath: brushEdge,
            backgroundImage: "repeating-linear-gradient(177deg, transparent 0 5px, rgba(255,255,255,.72) 6px 7px, transparent 8px 12px), linear-gradient(90deg, rgba(255,255,255,.5), transparent 9%, transparent 92%, rgba(0,0,0,.28))",
            filter: `blur(${props.roughness * 0.28}px)`,
          }}
        />
      </motion.div>

      {props.showNib ? (
        <motion.div
          data-marker-highlight-nib=""
          animate={[
            { left: "-2%", opacity: 0, offset: 0 },
            { left: "0%", opacity: 0.82, offset: 0.06 },
            { left: "100%", opacity: 0.82, offset: 0.74 },
            { left: "103%", opacity: 0, offset: 0.8 },
            { left: "103%", opacity: 0, offset: 1 },
          ]}
          transition={{ ease: [0.4, 0, 0.2, 1], fill: "both" }}
          style={{
            position: "absolute",
            top: "5%",
            bottom: "5%",
            width: "2.2%",
            minWidth: 7,
            borderRadius: "22% 54% 42% 26%",
            background: `linear-gradient(90deg, transparent, ${props.color} 34%, rgba(255,255,255,.74) 56%, ${props.color})`,
            boxShadow: `-9px 0 13px ${props.color}`,
            filter: `blur(${0.3 + props.roughness * 0.55}px)`,
            transform: "translateX(-48%) skewX(-7deg)",
            willChange: "left, opacity",
          }}
        />
      ) : null}
    </div>
  );
}

function HighlightLayer({
  children,
  props,
}: {
  children: ReactNode;
  props: MarkerHighlightProps;
}): ReactNode {
  const { width, height } = useFourierContext();

  return (
    <FourierMotion>
      <div
        data-marker-highlight-motion=""
        style={{
          position: "relative",
          width,
          height,
          overflow: "hidden",
          background: "transparent",
          isolation: "isolate",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            display: "flex",
          }}
        >
          {children}
        </div>
        <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
          <MarkerStroke props={props} />
        </div>
      </div>
    </FourierMotion>
  );
}

export const MarkerHighlightMotion = defineMotion({
  name: "MarkerHighlightMotion",
  schema: markerHighlightSchema,
  supportsTextMotion: false,
  component({ subject, props }) {
    return <HighlightLayer props={props}>{subject}</HighlightLayer>;
  },
  preview() {
    return { representativeProgress: 0.58, priority: "primary" };
  },
  designPreview() {
    const subjectStyle: CSSProperties = {
      width: 960,
      height: 420,
      display: "grid",
      placeItems: "center",
      overflow: "hidden",
      color: "#161616",
      background: "#f5efe2",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    };

    return {
      props: {},
      subject: (
        <div style={subjectStyle}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 750, letterSpacing: 5.5, textTransform: "uppercase" }}>
              Fourier 动效研究
            </div>
            <div style={{ marginTop: 22, fontSize: 76, fontWeight: 900, lineHeight: 0.96, letterSpacing: -4.6 }}>
              标记关键时刻
            </div>
            <div style={{ marginTop: 25, fontSize: 18, letterSpacing: 0.3, color: "#514d45" }}>
              包裹任意 React 节点，让高亮从左向右掠过。
            </div>
          </div>
        </div>
      ),
      composition: { width: 960, height: 420, durationSeconds: 3 },
      player: { loop: true },
    };
  },
});

export default MarkerHighlightMotion;
