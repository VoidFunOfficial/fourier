import {
  Canvas,
  defineProject,
  Image,
  Project,
  ReactLayer,
  Timeline,
  Transform,
} from "@fourier-video/sdk/project";

const posterTimeline = [
  { offset: 0, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0 },
  { offset: 0.191, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0 },
  { offset: 0.417, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
  { offset: 0.492, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
  { offset: 0.553, translateX: 14, translateY: -8, scaleX: 1.02, scaleY: 1.02, rotation: 0.3, opacity: 1 },
  { offset: 0.593, translateX: -18, translateY: 20, scaleX: 0.9, scaleY: 0.9, rotation: -2, opacity: 1 },
  { offset: 0.695, translateX: -210, translateY: 180, scaleX: 1.05, scaleY: 1.05, rotation: -8, opacity: 1 },
  { offset: 0.837, translateX: -850, translateY: 720, scaleX: 0.75, scaleY: 0.75, rotation: -25, opacity: 0.92 },
  { offset: 1, translateX: -1520, translateY: 1320, scaleX: 0.42, scaleY: 0.42, rotation: -45, opacity: 0 },
] as const;

/** Scene 8: Video Agent catches two handoffs, combines them, and reveals the poster. */
export default defineProject(
  <Project
    id="fourier-ad-scene-8"
    version="1.0"
    audioSampleRate={48_000}
    duration="173f"
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
        id="video-agent-merge"
        at="0f"
        duration="165f"
        preview
        component="components/SceneEightVideoMerge.tsx"
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={10}
      />

      <ReactLayer
        id="scene-eight-background-continuation"
        at="165f"
        duration="8f"
        preview
        component="components/SceneEightBackgroundContinuation.tsx"
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={0}
      />

      <Image
        id="poster-one-reveal"
        at="112f"
        duration="61f"
        preview
        src="assets/poster1.png"
        fit="contain"
        x={960}
        y={540}
        width={1382}
        height={778}
        layer={40}
      >
        <Transform
          id="poster-reveal-and-kick"
          at="0f"
          duration="61f"
          fill="both"
          easing="linear"
          keyframes={posterTimeline}
        />
      </Image>

      <ReactLayer
        id="poster-kick-cursor-and-frame"
        at="137f"
        duration="36f"
        preview
        component="components/SceneEightPosterKick.tsx"
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={50}
      />
    </Timeline>
  </Project>,
);
