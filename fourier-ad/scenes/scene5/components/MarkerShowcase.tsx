import { defineReact } from "@fourier-video/sdk";

function MarkerCard() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        border: "2px solid #25242b",
        color: "#25242b",
        background: "transparent",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 26,
          right: 26,
          top: 24,
          color: "#6f5cff",
          fontSize: 13,
          fontWeight: 760,
          letterSpacing: ".18em",
          textTransform: "uppercase",
        }}
      >
        MarkerHighlightMotion
      </div>
      <div style={{ width: "84%", textAlign: "left" }}>
        <div
          style={{
            fontSize: 48,
            fontWeight: 650,
            lineHeight: .93,
            letterSpacing: "-.065em",
          }}
        >
          MARK THE
          <br />
          MOMENT
        </div>
        <div
          style={{
            marginTop: 27,
            color: "#716e70",
            fontSize: 16,
            lineHeight: 1.5,
          }}
        >
          Sweep attention exactly where it matters.
        </div>
      </div>
    </div>
  );
}

export default defineReact({
  name: "SceneFiveMarkerShowcase",
  schema: {},
  static: true,
  component() {
    return <MarkerCard />;
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 480, height: 620, durationSeconds: 0 },
      player: { background: "#f5efe2" },
    };
  },
});
