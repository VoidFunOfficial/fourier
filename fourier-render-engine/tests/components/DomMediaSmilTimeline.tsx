import { defineReact, field, useFourierContext } from "@fourier-video/sdk";
// @ts-expect-error The browser bundler turns media imports into asset URLs.
import videoSource from "../fixtures/video.mp4";

export default defineReact({
  name: "DomMediaSmilTimeline",
  schema: {
    mode: field.enum(["both", "media", "smil"] as const, { default: "both" }),
  },
  component({ props }) {
    const context = useFourierContext();
    const showMedia = props.mode !== "smil";
    const showSmil = props.mode !== "media";
    return (
      <div style={{ width: context.width, height: context.height, background: "#020617" }}>
        {showMedia ? (
          <video
            src={videoSource}
            muted
            loop
            playsInline
            preload="auto"
            style={{
              width: "100%",
              height: showSmil ? "75%" : "100%",
              display: "block",
              objectFit: "cover",
            }}
          />
        ) : null}
        {showSmil ? (
          <svg width="100%" height={showMedia ? "25%" : "100%"} viewBox="0 0 64 16">
            <rect x="0" y="2" width="16" height="12" rx="2" fill="#f43f5e">
              <animate
                attributeName="x"
                from="0"
                to="48"
                dur="1s"
                repeatCount="indefinite"
              />
            </rect>
          </svg>
        ) : null}
      </div>
    );
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 64, height: 64, durationSeconds: 3 },
    };
  },
});
