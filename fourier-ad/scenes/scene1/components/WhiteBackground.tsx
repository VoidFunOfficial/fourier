import { defineReact } from "@fourier-video/sdk";

export default defineReact({
  name: "SceneOneWhiteBackground",
  schema: {},
  static: true,
  component() {
    return (
      <div
        role="presentation"
        style={{
          width: "100%",
          height: "100%",
          background: "#ffffff",
        }}
      />
    );
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 1920, height: 1080, durationSeconds: 0 },
      player: { background: "#000000" },
    };
  },
});
