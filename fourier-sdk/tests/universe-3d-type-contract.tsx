import {
  Universe3D,
  World3D,
  defineCamera3D,
} from "@fourier-video/sdk/universe-3d";

const camera = defineCamera3D({
  fov: 48,
  initial: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
  moves: [{
    at: "30f",
    duration: "1s",
    to: { rx: -8, ry: 24, rz: 1 },
    ease: [0.16, 1, 0.3, 1],
  }],
});

<Universe3D camera={camera}>
  <World3D id="card" x={200} y={-100} z={-900} width={640} height={240} ry={-12}>
    card
  </World3D>
</Universe3D>;

defineCamera3D({
  moves: [{
    at: "0f",
    duration: "1s",
    // @ts-expect-error Camera3D only accepts xyz/rxyz pose properties.
    to: { rotationY: 20 },
  }],
});

<World3D
  id="invalid"
  x={0}
  y={0}
  z={-100}
  width={100}
  height={100}
  // @ts-expect-error World3D rotation uses rx/ry/rz.
  rotationY={20}
/>;

export {};
