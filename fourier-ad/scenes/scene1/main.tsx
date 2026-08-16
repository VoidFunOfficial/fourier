import {
  Canvas,
  defineProject,
  Project,
  ReactLayer,
  Timeline,
  Video,
} from "@fourier-video/sdk/project";

/** Scene 1: the centered intro gives way to Scene 3's continuous wave field. */
export default defineProject(
  <Project
    id="fourier-ad-scene-1"
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
        id="white-background"
        at="0f"
        duration="151f"
        component="components/WhiteBackground.tsx"
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={0}
      />

      <Video
        id="centered-intro"
        at="0f"
        duration="121f"
        src="intro.mp4"
        sourceIn="0f"
        fit="contain"
        audio={false}
        rate={2}
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={10}
      />

      <ReactLayer
        id="circular-wave-reveal"
        at="0f"
        duration="151f"
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
          revealStartSeconds: 121 / 30,
          revealEndSeconds: 151 / 30,
        }}
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={20}
      />
    </Timeline>
  </Project>,
);
