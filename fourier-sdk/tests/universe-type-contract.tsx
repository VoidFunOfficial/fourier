import { Universe, World, defineCamera } from "@fourier-video/sdk/universe";

const camera = defineCamera({
  width: 1920,
  height: 1080,
  moves: [{
    at: "30f",
    duration: "1s",
    to: { kind: "fit", target: "diagram", fit: "contain", padding: 80 },
    path: { kind: "linear" },
    ease: [0.42, 0, 0.58, 1],
  }],
});

<Universe camera={camera}>
  <World id="diagram" x={0} y={0} width={100} height={100}>diagram</World>
</Universe>;

defineCamera({
  width: 1920,
  height: 1080,
  moves: [{
    at: "0f",
    duration: "1s",
    // @ts-expect-error Camera target requires a discriminated kind.
    to: { x: 100 },
  }],
});

defineCamera({
  width: 1920,
  height: 1080,
  moves: [{
    at: "0f",
    duration: "1s",
    to: { kind: "pose", x: 100 },
    // @ts-expect-error Unknown Camera Path kinds are rejected.
    path: { kind: "spiral" },
  }],
});

export {};
