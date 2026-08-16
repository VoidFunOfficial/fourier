import {
  Canvas,
  defineProject,
  Motion,
  Project,
  ReactLayer,
  Text,
  Timeline,
} from "@fourier-video/sdk/project";

/** Scene 10: Fourier runtime title reveal and four-module color drop. */
export default defineProject(
  <Project
    id="fourier-ad-scene-10"
    version="1.0"
    audioSampleRate={48_000}
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
        id="expanded-color-wave-wipe"
        at="0f"
        duration="240f"
        preview
        component="components/ColorWaveWipe.tsx"
        props={{ count: 11, shortestLength: 1, blurRadius: 24 }}
        x={960}
        y={540}
        width={1_920}
        height={1_080}
        layer={10}
      />

      <Text
        id="this-is-title"
        at="48f"
        duration="192f"
        preview
        role="title"
        content="This is"
        x={960}
        y={228}
        width={1_140}
        height={230}
        layer={30}
        font="assets/Montserrat-Black.ttf"
        fontSize={164}
        lineHeight={1}
        color="#f4efe4"
        align="center"
        verticalAlign="center"
        overflow="clip"
      >
        <Motion
          id="this-is-bouncy-motion"
          at="0f"
          duration="56f"
          fill="both"
          component="BouncyTextMotion.tsx"
          props={{
            textColor: "#f4efe4",
            accentColor: "#f2c14e",
            fontSize: 164,
            fontWeight: 900,
            letterSpacing: -3,
            bounceHeight: 104,
            stagger: 0.84,
            wobble: 5,
          }}
        />
      </Text>

      <Text
        id="fourier-handwritten-title"
        at="72f"
        duration="168f"
        preview
        role="title"
        content="Fourier"
        x={960}
        y={510}
        width={1_560}
        height={420}
        layer={40}
        font="assets/Beuty Rush.otf"
        fontSize={300}
        lineHeight={1}
        color="#f4efe4"
        align="center"
        verticalAlign="center"
        overflow="clip"
      >
        <Motion
          id="fourier-handwriting-motion"
          at="0f"
          duration="70f"
          fill="both"
          component="HandWritingTextMotion.tsx"
          props={{
            fontSize: 300,
            fontWeight: 400,
            letterSpacing: 1,
            lineGap: 0.12,
            inkColor: "#f4efe4",
            bulge: 1.8,
            evolutionSpeed: 1.25,
            fastBoxBlur: 0.75,
            alphaThreshold: 0.4,
            bevelWidth: 0.7,
            bevelDepth: 2.4,
            highlightStrength: 0.3,
            highlightColor: "#fff3d6",
            highlightAngle: -38,
          }}
        />
      </Text>

      <ReactLayer
        id="runtime-tagline"
        at="108f"
        duration="132f"
        preview
        component="components/SceneTenRuntimeTagline.tsx"
        props={{
          text: "NATIVE AGENT VIDEO PROJECT RUNTIME",
          color: "#f4efe4",
          fontSize: 28,
          centerY: 790,
        }}
        x={960}
        y={540}
        width={1_920}
        height={1_080}
        layer={50}
      />
      <ReactLayer
        id="runtime-tagline2"
        at="120f"
        duration="120f"
        preview
        component="components/SceneTenRuntimeTagline.tsx"
        props={{
          text: "This video is completely created by the Fourier Agent.",
          color: "#f4efe4",
          fontSize: 28,
          centerY: 790,
        }}
        x={960}
        y={580}
        width={1_920}
        height={1_080}
        layer={50}
      />

      {/* <ReactLayer
        id="render-engine-module-expansion"
        at="142f"
        duration="98f"
        preview
        component="components/ColorDropIntroNext.tsx"
        props={{
          count: 4,
          color1: "#f4efe4",
          color2: "#f2c14e",
          color3: "#e07a5f",
          color4: "#28362e",
          label1: "Render Engine",
          label2: "SDK",
          label3: "Tools",
          label4: "World",
          background: "transparent",
          gap: 0,
          padding: 48,
          contentAlign: "center",
          dropDuration: 1.15,
          brakeIntensity: 0.82,
          selectedBlock: 1,
          settlePause: 0.18,
          expandDuration: 0.95,
          collisionStrength: 0.82,
          collisionWave: 0.04,
        }}
        x={960}
        y={540}
        width={1_920}
        height={1_080}
        layer={100}
      /> */}
    </Timeline>
  </Project>,
);
