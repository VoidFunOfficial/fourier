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
import placeholderImageUrl from "../placeholder/pic/1.png";

export const elegantEntranceSchema = defineSchema({
  preset: field.enum(["fade", "rise", "zoom", "blur", "reveal"] as const, {
    label: "入场方式",
    default: "rise",
  }),
  distance: field.number({ label: "位移距离", min: 0, max: 180, default: 56 }),
  softness: field.number({ label: "柔化程度", min: 0, max: 40, default: 18 }),
  overshoot: field.number({ label: "回弹幅度", min: 0, max: 0.16, default: 0.035 }),
});

export type ElegantEntranceProps = InferFields<typeof elegantEntranceSchema>;

function entranceFrames(props: ElegantEntranceProps): readonly FourierMotionTarget[] {
  const hold: FourierMotionTarget = { opacity: 1, offset: 1 };
  switch (props.preset) {
    case "fade":
      return [
        { opacity: 0, filter: `blur(${props.softness * 0.35}px)`, offset: 0 },
        { opacity: 1, filter: "blur(0px)", offset: 0.42 },
        hold,
      ];
    case "zoom":
      return [
        { opacity: 0, scale: 0.82, filter: `blur(${props.softness}px)`, offset: 0 },
        { opacity: 1, scale: 1 + props.overshoot, filter: "blur(0px)", offset: 0.38 },
        { opacity: 1, scale: 1, filter: "blur(0px)", offset: 0.55 },
        hold,
      ];
    case "blur":
      return [
        { opacity: 0, scale: 1.06, filter: `blur(${props.softness * 1.45}px)`, offset: 0 },
        { opacity: 1, scale: 1, filter: "blur(0px)", offset: 0.46 },
        hold,
      ];
    case "reveal":
      return [
        {
          opacity: 0,
          y: props.distance * 0.34,
          clipPath: "inset(0 0 100% 0 round 28px)",
          filter: `blur(${props.softness * 0.45}px)`,
          offset: 0,
        },
        {
          opacity: 1,
          y: 0,
          clipPath: "inset(0 0 0% 0 round 28px)",
          filter: "blur(0px)",
          offset: 0.44,
        },
        hold,
      ];
    case "rise":
      return [
        { opacity: 0, y: props.distance, scale: 0.965, filter: `blur(${props.softness}px)`, offset: 0 },
        { opacity: 1, y: -props.distance * props.overshoot, scale: 1.008, filter: "blur(0px)", offset: 0.38 },
        { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", offset: 0.54 },
        hold,
      ];
  }
}

function EntranceLayer({
  children,
  props,
}: {
  children: ReactNode;
  props: ElegantEntranceProps;
}): ReactNode {
  const { width, height } = useFourierContext();
  return (
    <FourierMotion>
      <div
        style={{
          width,
          height,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          background: "transparent",
        }}
      >
        <motion.div
          animate={entranceFrames(props)}
          transition={{ ease: [0.16, 1, 0.3, 1] }}
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            transformOrigin: "50% 60%",
            willChange: "transform, opacity, filter, clip-path",
          }}
        >
          {children}
        </motion.div>
      </div>
    </FourierMotion>
  );
}

export const ElegantEntranceMotion = defineMotion({
  name: "ElegantEntranceMotion",
  schema: elegantEntranceSchema,
  supportsTextMotion: false,
  component({ subject, props }) {
    return <EntranceLayer props={props}>{subject}</EntranceLayer>;
  },
  preview() {
    return { representativeProgress: 0.38, priority: "primary" };
  },
  designPreview() {
    return {
      props: {},
      subject: (
        <div
          style={{
            width: 900,
            height: 500,
            display: "grid",
            placeItems: "center",
            background: "radial-gradient(circle at 50% 0%, #233152 0%, #0a0d16 62%)",
          }}
        >
          <div
            style={{
              width: 650,
              height: 340,
              display: "grid",
              gridTemplateRows: "230px 1fr",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,.18)",
              borderRadius: 28,
              background: "rgba(12,16,27,.76)",
              boxShadow: "0 36px 100px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.1)",
              backdropFilter: "blur(18px)",
            }}
          >
            <img
              src={placeholderImageUrl}
              width={650}
              height={230}
              style={{ width: 650, height: 230, objectFit: "cover" }}
            />
            <div style={{ padding: "18px 24px 20px", color: "#f8fafc", fontFamily: "Inter, system-ui, sans-serif" }}>
              <div style={{ fontSize: 12, color: "#7dd3fc", letterSpacing: 3, textTransform: "uppercase" }}>Fourier motion</div>
              <div style={{ marginTop: 7, fontSize: 28, fontWeight: 650, lineHeight: 1.08, letterSpacing: -1 }}>A softer way to arrive.</div>
            </div>
          </div>
        </div>
      ),
      composition: { width: 900, height: 500, durationSeconds: 3 },
      player: { background: "#090c14", loop: true },
    };
  },
});

export default ElegantEntranceMotion;
