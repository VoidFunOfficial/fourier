import {
  Canvas,
  defineProject,
  Image,
  Motion,
  Project,
  ReactLayer,
  Text,
  Timeline,
  Transform,
} from "@fourier-video/sdk/project";

const browserPush = [
  { offset: 0, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
  { offset: 0.36, translateX: -2140, translateY: 22, scaleX: 0.88, scaleY: 1.05, rotation: -2.8, opacity: 1 },
  { offset: 0.58, translateX: -1940, translateY: -10, scaleX: 1.025, scaleY: 0.988, rotation: 0.65, opacity: 0.9 },
  { offset: 0.78, translateX: -2020, translateY: 3, scaleX: 0.994, scaleY: 1.006, rotation: -0.16, opacity: 0.28 },
  { offset: 1, translateX: -2000, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0 },
] as const;

function effectWhip(direction: -1 | 0 | 1) {
  const targetX = direction * 550;
  return [
    { offset: 0, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    { offset: 0.16, translateX: -direction * 36, translateY: 28, scaleX: 1.06, scaleY: 0.94, rotation: -direction * 4, opacity: 1 },
    { offset: 0.62, translateX: targetX * 1.07, translateY: -170, scaleX: 0.7, scaleY: 1.1, rotation: direction * 7, opacity: 0.94 },
    { offset: 0.8, translateX: targetX * 0.97, translateY: -145, scaleX: 0.14, scaleY: 0.18, rotation: -direction * 1.4, opacity: 0.35 },
    { offset: 1, translateX: targetX, translateY: -150, scaleX: 0.05, scaleY: 0.05, rotation: 0, opacity: 0 },
  ] as const;
}

/** Scene 6: cursor-led search, component selection, and a smooth mail handoff. */
export default defineProject(
  <Project id="fourier-ad-scene-6" version="1.0" audioSampleRate={48_000}>
    <Canvas width={1920} height={1080} fps={30} background="#000000" colorSpace="sRGB" />
    <Timeline>
      <ReactLayer
        id="scene-five-background-continuation"
        at="0f"
        duration="7.5s"
        preview
        component="components/SceneFiveBackgroundContinuation.tsx"
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={0}
      />

      <ReactLayer
        id="browser-search-camera"
        at="0f"
        duration="7.5s"
        preview
        component="components/SceneSixBrowserOverlay.tsx"
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={20}
      >
        <Transform id="browser-overlay-push" at="6.55s" duration="0.65s" fill="both" easing="cubic-bezier(.16,1,.3,1)" keyframes={browserPush} />
      </ReactLayer>

      <Text
        id="handwriting-effect"
        at="3.15s"
        duration="4.35s"
        preview
        role="title"
        content="勾勒创意"
        x={410}
        y={660}
        width={390}
        height={170}
        layer={40}
        font="assets/Beuty Rush.otf"
        fontSize={72}
        lineHeight={1.05}
        color="#241d1a"
        align="center"
        verticalAlign="center"
      >
        <Motion
          id="handwriting-motion"
          at="0f"
          duration="1.25s"
          fill="both"
          component="HandWritingMotion.tsx"
          props={{ fontSize: 72, inkColor: "#241d1a", bulge: 2.4, evolutionSpeed: 1.5 }}
        />
        <Transform id="handwriting-whip" at="2.1s" duration="0.58s" fill="both" easing="cubic-bezier(.16,1,.3,1)" keyframes={effectWhip(1)} />
      </Text>

      <Image
        id="outline-effect"
        at="3.15s"
        duration="4.35s"
        preview
        src="assets/outline-subject.png"
        fit="contain"
        x={960}
        y={670}
        width={310}
        height={350}
        layer={41}
      >
        <Motion
          id="outline-draw-motion"
          at="0f"
          duration="1.25s"
          fill="both"
          component="OutlineDraw.tsx"
          props={{ color: "#b8617b", strokeWidth: 12, outlineGap: 5, contentScale: 0.9, glow: 7 }}
        />
        <Transform id="outline-whip" at="2.38s" duration="0.58s" fill="both" easing="cubic-bezier(.16,1,.3,1)" keyframes={effectWhip(0)} />
      </Image>

      <Text
        id="glow-effect"
        at="3.15s"
        duration="4.35s"
        preview
        role="title"
        content="AI 灵感成真"
        x={1510}
        y={660}
        width={400}
        height={170}
        layer={42}
        font="assets/Beuty Rush.otf"
        fontSize={62}
        lineHeight={1.05}
        color="#5f6f6d"
        align="center"
        verticalAlign="center"
      >
        <Motion
          id="left-to-right-glow"
          at="0f"
          duration="1.25s"
          fill="both"
          component="Left2RightGlow.tsx"
          props={{ baseColor: "#5f6f6d", accentColor: "#4eaaa3", glowColor: "#f8fffb", fontSize: 62, letterSpacing: 1, glowRadius: 20 }}
        />
        <Transform id="glow-whip" at="2.66s" duration="0.58s" fill="both" easing="cubic-bezier(.16,1,.3,1)" keyframes={effectWhip(-1)} />
      </Text>

      <ReactLayer
        id="smooth-mail-change"
        at="5.6s"
        duration="1.9s"
        preview
        component="components/SmoothChange.tsx"
        props={{
          transitionStart: 0.42,
          transitionDuration: 0.3,
          shakeIntensity: 10,
          shakeCount: 7,
          imageSize: 54,
          hitStart: 0.8,
        }}
        x={960}
        y={540}
        width={1920}
        height={1080}
        layer={100}
      />
    </Timeline>
  </Project>,
);
