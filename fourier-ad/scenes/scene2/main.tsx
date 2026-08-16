import {
  Canvas,
  defineProject,
  Project,
  ReactLayer,
  Timeline,
} from "@fourier-video/sdk/project";

/** Scene 2: deterministic soft-body typography with a tracked camera. */
export default defineProject(
  <Project
    id="fourier-ad-scene-2"
    version="1.0"
    audioSampleRate={48_000}
  >
    <Canvas
      width={1920}
      height={1080}
      fps={30}
      background="#000000"
      colorSpace="sRGB"
    />

    <Timeline>
      <ReactLayer
        id="soft-body-camera"
        at="0f"
        duration="9s"
        preview
        component="components/SceneTwoPhysics.tsx"
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={0}
      />
    </Timeline>
  </Project>,
);
