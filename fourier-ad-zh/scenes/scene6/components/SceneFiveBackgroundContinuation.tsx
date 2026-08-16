import { defineReact, useFourierContext } from "@fourier-video/sdk";

/** Scene-local copy of the Scene 5 background for a frame-perfect handoff. */
function SceneFiveBackgroundContinuation() {
  const { width, height } = useFourierContext();
  return (
    <div
      aria-label="Scene 5 background continuing behind the browser"
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
  name: "SceneFiveBackgroundContinuation",
  schema: {},
  static: true,
  component() {
    return <SceneFiveBackgroundContinuation />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: 0 },
      player: { background: "#565473" },
    };
  },
});
