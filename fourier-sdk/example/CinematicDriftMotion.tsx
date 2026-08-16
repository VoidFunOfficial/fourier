import {
  FourierMotion,
  defineMotion,
  defineSchema,
  field,
  motion,
  useFourierContext,
  type InferFields,
  type ReactNode,
} from "@fourier-video/sdk/motion";
import placeholderImageUrl from "../placeholder/pic/3.png";

export const cinematicDriftSchema = defineSchema({
  direction: field.enum(["left", "right", "up"] as const, {
    label: "漂移方向",
    default: "right",
  }),
  distance: field.number({ label: "漂移距离", min: 0, max: 120, default: 42 }),
  zoom: field.number({ label: "推进倍率", min: 1, max: 1.35, default: 1.12 }),
  vignette: field.number({ label: "暗角强度", min: 0, max: 1, default: 0.48 }),
  lightColor: field.color({ label: "掠光颜色", default: "#ffd8ad" }),
});

export type CinematicDriftProps = InferFields<typeof cinematicDriftSchema>;

function DriftLayer({
  children,
  props,
}: {
  children: ReactNode;
  props: CinematicDriftProps;
}): ReactNode {
  const { width, height } = useFourierContext();
  const start = props.direction === "left"
    ? { x: props.distance * 0.5, y: 0 }
    : props.direction === "up"
      ? { x: 0, y: props.distance * 0.45 }
      : { x: -props.distance * 0.5, y: 0 };
  const end = props.direction === "left"
    ? { x: -props.distance * 0.5, y: 0 }
    : props.direction === "up"
      ? { x: 0, y: -props.distance * 0.55 }
      : { x: props.distance * 0.5, y: 0 };

  return (
    <FourierMotion>
      <div style={{ position: "relative", width, height, overflow: "hidden", background: "#080b12" }}>
        <motion.div
          animate={[
            { ...start, scale: 1.015, filter: "saturate(.9) contrast(1.04)", offset: 0 },
            { x: 0, y: 0, scale: 1 + (props.zoom - 1) * 0.55, filter: "saturate(1.03) contrast(1.06)", offset: 0.52 },
            { ...end, scale: props.zoom, filter: "saturate(1.1) contrast(1.08)", offset: 1 },
          ]}
          transition={{ ease: [0.37, 0, 0.2, 1] }}
          style={{
            position: "absolute",
            inset: "-7%",
            display: "flex",
            transformOrigin: "50% 50%",
            willChange: "transform, filter",
          }}
        >
          {children}
        </motion.div>

        <motion.div
          aria-hidden="true"
          animate={[
            { x: "-160%", rotate: 13, opacity: 0, offset: 0 },
            { x: "-95%", rotate: 13, opacity: 0, offset: 0.18 },
            { x: "10%", rotate: 13, opacity: 0.34, offset: 0.52 },
            { x: "145%", rotate: 13, opacity: 0, offset: 0.82 },
            { x: "170%", rotate: 13, opacity: 0, offset: 1 },
          ]}
          transition={{ ease: "ease-in-out" }}
          style={{
            position: "absolute",
            top: "-30%",
            bottom: "-30%",
            left: "28%",
            width: "18%",
            background: `linear-gradient(90deg, transparent, ${props.lightColor}, transparent)`,
            filter: "blur(34px)",
            mixBlendMode: "screen",
            transform: "rotate(13deg)",
            pointerEvents: "none",
          }}
        />

        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at 50% 45%, transparent 38%, rgba(2,5,12,${props.vignette}) 100%), linear-gradient(180deg, rgba(4,7,15,.1), rgba(4,7,15,.24))`,
            pointerEvents: "none",
          }}
        />
      </div>
    </FourierMotion>
  );
}

export const CinematicDriftMotion = defineMotion({
  name: "CinematicDriftMotion",
  schema: cinematicDriftSchema,
  supportsTextMotion: false,
  component({ subject, props }) {
    return <DriftLayer props={props}>{subject}</DriftLayer>;
  },
  preview() {
    return { representativeProgress: 0.58, priority: "primary" };
  },
  designPreview() {
    return {
      props: {},
      subject: (
        <img
          src={placeholderImageUrl}
          width={1020}
          height={620}
          style={{ width: 1020, height: 620, objectFit: "cover" }}
        />
      ),
      composition: { width: 960, height: 540, durationSeconds: 6 },
      player: { background: "#070a11", loop: true },
    };
  },
});

export default CinematicDriftMotion;
