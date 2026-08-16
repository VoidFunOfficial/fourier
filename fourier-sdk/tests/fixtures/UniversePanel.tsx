import { defineReact } from "@fourier-video/sdk";
import { FourierMotion, motion } from "@fourier-video/sdk/motion";
import { Universe, World, defineCamera } from "@fourier-video/sdk/universe";

const camera = defineCamera({
  width: 200,
  height: 100,
  initial: { x: 0, y: 0, zoom: 1, rotation: 0 },
  moves: [{
    at: "0f",
    duration: "60f",
    to: { kind: "fit", target: "destination", fit: "contain", padding: 20 },
    path: {
      kind: "bezier",
      control1: { x: 20, y: -30 },
      control2: { x: 80, y: 30 },
    },
    ease: "ease-in-out",
  }],
});

export default defineReact({
  name: "UniversePanel",
  schema: {},
  component() {
    return (
      <Universe camera={camera} overscan={0.25}>
        <World id="origin" x={0} y={0} width={40} height={40} zIndex={1}>
          <div style={{ width: "100%", height: "100%", background: "#ef4444" }} />
        </World>
        <World
          id="destination"
          x={100}
          y={0}
          width={80}
          height={40}
          rotation={10}
          zIndex={2}
        >
          <FourierMotion>
            <motion.div
              initial={{ scale: 0.75, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 2, ease: "ease-in-out" }}
              style={{ width: "100%", height: "100%", background: "#2563eb" }}
            />
          </FourierMotion>
        </World>
        <World id="far" x={10_000} y={10_000} width={20} height={20}>
          <div style={{ width: "100%", height: "100%", background: "#22c55e" }} />
        </World>
      </Universe>
    );
  },
  designPreview() {
    return {
      props: {},
      composition: { width: 400, height: 200, durationSeconds: 2 },
    };
  },
});
