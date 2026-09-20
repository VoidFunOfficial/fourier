/** @jsxRuntime classic */
/** @jsx React.createElement */

import {
  FourierMotion,
  React,
  defineReact,
  defineSchema,
  field,
  motion,
  useFourierContext,
  type FourierMotionTarget,
  type InferFields,
} from "@fourier-video/sdk";

export const BEN_CORNER_DURATION_SECONDS = 4;
export const BEN_CORNER_MAX_ROUNDNESS = 320;

export const morphingCornerTileSchema = defineSchema({
  background: field.color({ label: "背景", default: "#EEEAE1" }),
  tile: field.color({ label: "形状", default: "#EB563E" }),
  ink: field.color({ label: "线条", default: "#151515" }),
});
export type MorphingCornerTileProps = InferFields<typeof morphingCornerTileSchema>;

export function benCornerMorphFrames(): readonly FourierMotionTarget[] {
  return [
    { borderRadius: "50%", rotate: -8, scale: 0.92, offset: 0 },
    { borderRadius: "10%", rotate: 0, scale: 1.04, offset: 0.38 },
    { borderRadius: "0%", rotate: 8, scale: 0.96, offset: 0.62 },
    { borderRadius: "50%", rotate: -8, scale: 0.92, offset: 1 },
  ];
}

function MorphingCornerTileLayer({ props }: { readonly props: MorphingCornerTileProps }) {
  const { width, height } = useFourierContext();
  const scale = Math.min(width / 1920, height / 1080);
  const size = 620 * scale;
  return (
    <FourierMotion>
      <div
        aria-label="Ben Marriott corner roundness morph"
        data-ben-corner-morph=""
        data-max-roundness={BEN_CORNER_MAX_ROUNDNESS}
        style={{
          position: "relative",
          width,
          height,
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          background: props.background,
        }}
      >
        <motion.div
          animate={benCornerMorphFrames()}
          transition={{ ease: "cubic-bezier(.65,0,.35,1)", fill: "both" }}
          style={{
            position: "relative",
            width: size,
            height: size,
            overflow: "hidden",
            background: props.tile,
            border: 12 * scale + "px solid " + props.ink,
            boxSizing: "border-box",
            boxShadow: 34 * scale + "px " + 38 * scale + "px 0 " + props.ink,
            willChange: "transform, border-radius",
          }}
        >
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: (index + 1) * size / 6,
                height: 4 * scale,
                background: props.ink,
                opacity: 0.82,
                transform: "rotate(" + (index % 2 === 0 ? -12 : 12) + "deg) scaleX(1.4)",
              }}
            />
          ))}
        </motion.div>
      </div>
    </FourierMotion>
  );
}

const MorphingCornerTile = defineReact({
  name: "BenMarriottMorphingCornerTile",
  schema: morphingCornerTileSchema,
  component({ props }) {
    return <MorphingCornerTileLayer props={props} />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, fps: 60, durationSeconds: BEN_CORNER_DURATION_SECONDS },
      player: { background: "#EEEAE1", loop: true },
    };
  },
});

export default MorphingCornerTile;
