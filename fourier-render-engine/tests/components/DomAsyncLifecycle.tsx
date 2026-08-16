import { defineReact, useFourierLifecycle } from "@fourier-video/sdk";

export default defineReact({
  name: "DomAsyncLifecycle",
  schema: {},
  component() {
    useFourierLifecycle({
      fourierStart: (() => Promise.resolve()) as never,
      fourierEnd() {},
    });
    return <div />;
  },
  designPreview() {
    return { props: {}, composition: { width: 32, height: 24, durationSeconds: 1 } };
  },
});
