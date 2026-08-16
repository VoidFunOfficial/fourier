import { defineReact, useFourierContext } from "@fourier-video/sdk/react";

export default defineReact({
  name: "DomTransparentPanel",
  schema: {},
  static: true,
  component() {
    const context = useFourierContext();
    return (
      <div style={{ width: context.width, height: context.height, background: "transparent" }}>
        <div style={{ width: 8, height: 8, background: "#ef4444" }} />
      </div>
    );
  },
  designPreview() {
    return { props: {}, composition: { width: 16, height: 16, durationSeconds: 0 } };
  },
});
