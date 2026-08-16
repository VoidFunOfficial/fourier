import { defineReact } from "@fourier-video/sdk";
import {
  Universe,
  World,
  defineCamera,
  defineCameraProgram,
} from "@fourier-video/sdk/universe";

const camera = defineCameraProgram({
  cameras: {
    red: defineCamera({ width: 200, height: 100, initial: { x: 0, y: 0 } }),
    blue: defineCamera({ width: 200, height: 100, initial: { x: 200, y: 0 } }),
  },
  initialCamera: "red",
  cuts: [{ at: "30f", to: "blue" }],
});

export default defineReact({
  name: "UniverseProgramPanel",
  schema: {},
  component() {
    return (
      <Universe camera={camera}>
        <World id="red" x={0} y={0} width={200} height={100} cull="never">
          <div style={{ width: "100%", height: "100%", background: "#ef4444" }} />
        </World>
        <World id="blue" x={200} y={0} width={200} height={100} cull="never">
          <div style={{ width: "100%", height: "100%", background: "#2563eb" }} />
        </World>
      </Universe>
    );
  },
  designPreview() {
    return { props: {}, composition: { width: 400, height: 200, durationSeconds: 1 } };
  },
});
