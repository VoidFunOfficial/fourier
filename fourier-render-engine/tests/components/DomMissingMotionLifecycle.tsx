import { defineMotion } from "@fourier-video/sdk";

export default defineMotion({
  name: "DomMissingMotionLifecycle",
  schema: {},
  supportsTextMotion: false,
  component({ subject }) {
    return <div>{subject}</div>;
  },
  designPreview() {
    return {
      props: {},
      subject: "subject",
      composition: { width: 32, height: 24, durationSeconds: 1 },
    };
  },
});
