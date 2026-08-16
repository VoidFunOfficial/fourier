import { defineReact } from "@fourier-video/sdk";

export default defineReact({
  name: "DomStaticPanel",
  schema: {},
  static: true,
  component() {
    return <div style={{ width: 32, height: 24, background: "#7c3aed" }} />;
  },
  designPreview() {
    return { props: {}, composition: { width: 32, height: 24, durationSeconds: 0 } };
  },
});
