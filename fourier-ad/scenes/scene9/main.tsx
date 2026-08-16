import {
  Canvas,
  defineProject,
  Project,
  ReactLayer,
  Timeline,
  Transform,
} from "@fourier-video/sdk/project";

const montageEntrance = [
  {
    offset: 0,
    translateX: 0,
    translateY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 0,
  },
  {
    offset: 1,
    translateX: 0,
    translateY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
  },
] as const;

/** Scene 9: Review Agent revises the Video poster, then accelerates through variants. */
export default defineProject(
  <Project
    id="fourier-ad-scene-9"
    version="1.0"
    audioSampleRate={48_000}
    duration="312f"
  >
    <Canvas
      width={1_920}
      height={1_080}
      fps={30}
      background="#000000"
      colorSpace="sRGB"
    />

    <Timeline>
      <ReactLayer
        id="review-agent-world"
        at="0f"
        duration="204f"
        preview
        component="components/SceneNineReviewWorld.tsx"
        x={960}
        y={540}
        width={1_920}
        height={1_080}
        layer={10}
      />

      <ReactLayer
        id="accelerating-poster-montage"
        at="202f"
        duration="110f"
        preview
        component="components/CinematicPageFlip3D.tsx"
        props={{
          background: "#17221b",
          flashColor: "#fffaf0",
          flashIntensity: 0.66,
        }}
        x={960}
        y={540}
        width={1_920}
        height={1_080}
        layer={20}
      >
        <Transform
          id="poster-montage-entrance"
          at="0f"
          duration="4f"
          fill="both"
          easing="linear"
          keyframes={montageEntrance}
        />
      </ReactLayer>

      <ReactLayer
        id="review-swipe-cursor"
        at="202f"
        duration="110f"
        preview
        component="components/SceneNineSwipeCursor.tsx"
        x={960}
        y={540}
        width={1_920}
        height={1_080}
        layer={30}
      />
    </Timeline>
  </Project>,
);
