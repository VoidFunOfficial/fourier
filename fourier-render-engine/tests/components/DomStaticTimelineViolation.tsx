import {
  defineReact,
  useFourierLifecycle,
} from "@fourier-video/sdk";

export default defineReact({
  name: "DomStaticTimelineViolation",
  schema: {},
  static: true,
  component() {
    useFourierLifecycle({
      fourierStart() {},
      fourierEnd() {},
    });
    return <div style={{ width: 16, height: 16, background: "#ef4444" }} />;
  },
  designPreview() {
    return { props: {}, composition: { width: 16, height: 16, durationSeconds: 0 } };
  },
});
