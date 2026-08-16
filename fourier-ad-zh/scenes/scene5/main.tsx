import {
  Canvas,
  defineProject,
  Motion,
  Project,
  ReactLayer,
  Timeline,
  Transform,
} from "@fourier-video/sdk/project";

const cardEntrance = (direction: number) => [
  { offset: 0, translateX: direction * 54, translateY: 138, scaleX: .86, scaleY: .78, rotation: direction * 2.4, opacity: 0 },
  { offset: .54, translateX: -direction * 10, translateY: -22, scaleX: 1.025, scaleY: .985, rotation: -direction * .6, opacity: 1 },
  { offset: .76, translateX: direction * 4, translateY: 7, scaleX: .992, scaleY: 1.008, rotation: direction * .18, opacity: 1 },
  { offset: 1, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
] as const;

const cardExit = (direction: number) => [
  { offset: 0, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
  { offset: .3, translateX: direction * 8, translateY: -5, scaleX: 1.01, scaleY: .99, rotation: direction * .25, opacity: 1 },
  { offset: 1, translateX: direction * 28, translateY: 18, scaleX: .94, scaleY: .94, rotation: direction * .8, opacity: 0 },
] as const;

/** Scene 5: Search Agent opens Fourier World and reveals staggered SDK examples. */
export default defineProject(
  <Project id="fourier-ad-scene-5" version="1.0" audioSampleRate={48_000}>
    <Canvas width={1920} height={1080} fps={30} background="#000000" colorSpace="sRGB" />
    <Timeline>
      <ReactLayer
        id="blue-purple-background"
        at="0f"
        duration="8.1s"
        preview
        component="components/BluePurpleBackground.tsx"
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={0}
      />

      <ReactLayer
        id="search-world-browser"
        at="0f"
        duration="8.1s"
        preview
        component="components/SceneFiveWorld.tsx"
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={30}
      />

      <ReactLayer
        id="fourier-world-window"
        at="66f"
        duration="177f"
        preview
        component="components/FourierWorldWindow.tsx"
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={10}
      />

      <ReactLayer
        id="marker-highlight-example"
        at="129f"
        duration="114f"
        preview
        component="components/MarkerShowcase.tsx"
        x={410}
        y={675}
        width={480}
        height={620}
        layer={20}
      >
        <Motion
          id="marker-highlight-sweep"
          at="0.45s"
          duration="2.3s"
          fill="both"
          component="MarkerHighlightMotion.tsx"
          props={{
            color: "#ffd84d",
            thickness: 18,
            position: 46,
            inset: 7,
            angle: -1.5,
            opacity: .68,
            roughness: .72,
            blendMode: "multiply",
            showNib: true,
          }}
        />
        <Transform id="marker-card-entrance" at="0f" duration="1s" fill="both" easing="cubic-bezier(.16,1,.3,1)" keyframes={cardEntrance(-1)} />
        <Transform id="marker-card-exit" at="93f" duration="15f" fill="forwards" easing="cubic-bezier(.4,0,1,1)" keyframes={cardExit(-1)} />
      </ReactLayer>

      <ReactLayer
        id="example-3d"
        at="136f"
        duration="107f"
        preview
        component="components/Example3D.tsx"
        props={{ rotationTurns: 1.25, scale: 1.06, background: "#07111f" }}
        x={960}
        y={675}
        width={480}
        height={620}
        layer={21}
      >
        <Transform id="example-3d-entrance" at="0f" duration="1s" fill="both" easing="cubic-bezier(.16,1,.3,1)" keyframes={cardEntrance(0)} />
        <Transform id="example-3d-exit" at="86f" duration="15f" fill="forwards" easing="cubic-bezier(.4,0,1,1)" keyframes={cardExit(0)} />
      </ReactLayer>

      <ReactLayer
        id="color-wipe-example"
        at="143f"
        duration="100f"
        preview
        component="components/ColorWipe.tsx"
        props={{
          orientation: "portrait",
          direction: "forward",
          color: "#6d28d9",
          secondaryColor: "#ec4899",
          accentColor: "#22d3ee",
          layers: 4,
          stagger: .62,
          hold: .055,
          edgeSlant: 4,
          easing: "snappy",
        }}
        x={1510}
        y={675}
        width={480}
        height={620}
        layer={22}
      >
        <Transform id="color-wipe-entrance" at="0f" duration="1s" fill="both" easing="cubic-bezier(.16,1,.3,1)" keyframes={cardEntrance(1)} />
        <Transform id="color-wipe-exit" at="79f" duration="15f" fill="forwards" easing="cubic-bezier(.4,0,1,1)" keyframes={cardExit(1)} />
      </ReactLayer>
    </Timeline>
  </Project>,
);
