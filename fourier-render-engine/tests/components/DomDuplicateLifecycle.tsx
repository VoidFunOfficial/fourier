import { defineReact, useFourierLifecycle } from "@fourier-video/sdk";

export default defineReact({
  name: "DomDuplicateLifecycle",
  schema: {},
  component() {
    useFourierLifecycle({ fourierStart() {}, fourierEnd() {} });
    useFourierLifecycle({ fourierStart() {}, fourierEnd() {} });
    return <div />;
  },
  designPreview() {
    return { props: {}, composition: { width: 32, height: 24, durationSeconds: 1 } };
  },
});
