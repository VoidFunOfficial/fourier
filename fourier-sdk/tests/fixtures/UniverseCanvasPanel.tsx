import {
  BoxGeometry,
  FourierCanvas,
  Mesh,
  MeshBasicMaterial,
  defineReact,
  useRef,
} from "@fourier-video/sdk/three";
import { Universe, World, defineCamera } from "@fourier-video/sdk/universe";

const camera = defineCamera({
  width: 200,
  height: 100,
  moves: [{
    at: "0f",
    duration: "60f",
    to: { kind: "pose", x: 40, zoom: 1.4, rotation: 8 },
    ease: "ease-in-out",
  }],
});

export default defineReact({
  name: "UniverseCanvasPanel",
  schema: {},
  component() {
    const mesh = useRef<Mesh | null>(null);
    return (
      <Universe camera={camera}>
        <World id="canvas" x={-40} y={0} width={60} height={60} cull="never">
          <canvas style={{ width: "100%", height: "100%", background: "#f59e0b" }} />
        </World>
        <World id="three" x={40} y={0} width={60} height={60} cull="never">
          <FourierCanvas
            onCreate={({ scene }) => {
              const cube = new Mesh(
                new BoxGeometry(1.8, 1.8, 1.8),
                new MeshBasicMaterial({ color: 0x38bdf8 }),
              );
              mesh.current = cube;
              scene.add(cube);
            }}
            onFrame={({ progress }) => {
              if (mesh.current !== null) {
                mesh.current.rotation.x = progress * Math.PI;
                mesh.current.rotation.y = progress * Math.PI * 2;
              }
            }}
          />
        </World>
      </Universe>
    );
  },
  designPreview() {
    return { props: {}, composition: { width: 400, height: 200, durationSeconds: 1 } };
  },
});
