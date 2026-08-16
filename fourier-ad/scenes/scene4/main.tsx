import {
  Canvas,
  defineProject,
  Project,
  ReactLayer,
  Timeline,
} from "@fourier-video/sdk/project";

/** Scene 4: the prompt collapses into a cursor and splits into four agents. */
export default defineProject(
  <Project
    id="fourier-ad-scene-4"
    version="1.0"
    audioSampleRate={48_000}
    duration="121f"
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
        id="particle-wave-background"
        at="0f"
        duration="121f"
        preview
        component="components/BackgroundWaveShare.tsx"
        props={{
          backgroundColor: "#23212d",
          idleColor: "#4b4857",
          activeColor: "#8274ff",
          pixelSize: 18,
          pixelGap: 8,
          waveCount: 6,
          waveThickness: 92,
          dropDistance: 20,
          gaussianBlur: 5,
          timeOffsetSeconds: 7,
        }}
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={0}
      />

      <ReactLayer
        id="agent-split"
        at="0f"
        duration="121f"
        preview
        component="components/AgentSplit.tsx"
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={10}
      />
    </Timeline>
  </Project>,
);
