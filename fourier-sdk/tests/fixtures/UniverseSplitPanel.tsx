import { defineReact } from "@fourier-video/sdk";
import { Universe, World, defineCamera } from "@fourier-video/sdk/universe";

const leftCamera = defineCamera({ width: 100, height: 100 });
const rightCamera = defineCamera({ width: 100, height: 100, initial: { x: 200 } });

export default defineReact({
  name: "UniverseSplitPanel",
  schema: {},
  component() {
    return (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <div style={{ width: "50%", height: "100%" }}>
          <Universe camera={leftCamera}>
            <World id="shared" x={0} y={0} width={100} height={100}>
              <div style={{ width: "100%", height: "100%", background: "#ef4444" }} />
            </World>
          </Universe>
        </div>
        <div style={{ width: "50%", height: "100%" }}>
          <Universe camera={rightCamera}>
            <World id="shared" x={200} y={0} width={100} height={100}>
              <div style={{ width: "100%", height: "100%", background: "#2563eb" }} />
            </World>
          </Universe>
        </div>
      </div>
    );
  },
  designPreview() {
    return { props: {}, composition: { width: 400, height: 200, durationSeconds: 0 } };
  },
});
