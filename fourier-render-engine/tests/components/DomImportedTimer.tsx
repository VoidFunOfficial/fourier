import { defineReact } from "@fourier-video/sdk";
import { installTimer } from "./dom-imported-timer.ts";

export default defineReact({
  name: "DomImportedTimer",
  schema: {},
  component() {
    installTimer();
    return <div />;
  },
  designPreview() {
    return { props: {}, composition: { width: 16, height: 16, durationSeconds: 0 } };
  },
});
