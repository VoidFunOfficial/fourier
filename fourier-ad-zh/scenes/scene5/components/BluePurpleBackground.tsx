import { defineReact, useFourierContext } from "@fourier-video/sdk";

/** Exact continuation of Scene 4 after the blue-purple energy field fills the frame. */
function BluePurpleBackground() {
  const { width, height } = useFourierContext();
  return (
    <div
      aria-label="Blue-purple Scene 4 continuation background"
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        background: "#565473",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          opacity: .22,
          backgroundImage: [
            "linear-gradient(rgba(224,220,255,.14) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(224,220,255,.14) 1px, transparent 1px)",
          ].join(","),
          backgroundSize: "96px 96px",
          boxShadow: "inset 0 0 220px rgba(28,25,48,.28)",
        }}
      />
    </div>
  );
}

export default defineReact({
  name: "SceneFiveBluePurpleBackground",
  schema: {},
  static: true,
  component() {
    return <BluePurpleBackground />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: 0 },
      player: { background: "#565473" },
    };
  },
});
